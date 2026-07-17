import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import { explorePhaseTodoUpdateBlockedReason, resolveTodoListUpdate } from '@main/agent/coding/plan-mode-todo-update-guard'
import {
  planModeStorageOptionsFromEnv,
  readPlanModeTodoList,
  writePlanModeTodoList,
} from '@main/agent/coding/plan-mode-storage-impl'
import { getSandboxRootFromEnv, getSandboxOutputScopeFromEnv, getConversationIdFromEnv } from './sandbox-paths'
import { readTodoList, writeTodoList } from '@main/agent/todos'
import {
  renderTodoChecklist,
  summarizeTodos,
  todosNamespaceFromScope,
  TRACKED_TODO_STATUSES,
  TRACKED_TODO_FALLBACK_PLANS,
  UPDATE_TODOS_ALL_DONE_MESSAGE,
  type TodoList,
} from '@shared/agent/todos'

const TODO_TAG = ['task-tracking'] as const

const trackedTodoInputSchema = z.object({
  content: z.string().min(1).describe('Short, actionable task description.'),
  status: z
    .enum(TRACKED_TODO_STATUSES as unknown as [string, ...string[]])
    .optional()
    .default('pending')
    .describe('pending | in_progress | completed | cancelled'),
  success_criteria: z
    .string()
    .optional()
    .describe(
      'Observable pass/fail condition for this step (shown to the execution verifier).',
    ),
  verify_command: z
    .string()
    .optional()
    .describe(
      'Optional shell command run in the workspace after execution (non-zero exit = fail).',
    ),
  fallback_plan: z
    .enum(TRACKED_TODO_FALLBACK_PLANS as unknown as [string, ...string[]])
    .optional()
    .describe('retry | skip | manual_intervention when verification fails.'),
})

function persistTodoList(list: TodoList): void {
  const conversationId = getConversationIdFromEnv()
  if (conversationId) {
    writePlanModeTodoList(
      conversationId,
      list,
      planModeStorageOptionsFromEnv(conversationId),
    )
    return
  }
  const sandboxRoot = getSandboxRootFromEnv()
  if (!sandboxRoot) return
  const namespace = todosNamespaceFromScope(getSandboxOutputScopeFromEnv())
  writeTodoList(sandboxRoot, list, namespace)
}

function loadTodoList() {
  const conversationId = getConversationIdFromEnv()
  if (conversationId) {
    return readPlanModeTodoList(
      conversationId,
      planModeStorageOptionsFromEnv(conversationId),
    )
  }
  const sandboxRoot = getSandboxRootFromEnv()
  if (!sandboxRoot) return null
  const namespace = todosNamespaceFromScope(getSandboxOutputScopeFromEnv())
  return readTodoList(sandboxRoot, namespace)
}

/**
 * update_todos — the agent's live task list.
 *
 * With a conversation id, tasks persist next to the plan file at
 * `<sandbox>/plans/todos.json`. The plan markdown is `<sandbox>/plans/<slug>.md`.
 */
export const updateTodos: SkillTool = {
  name: 'update_todos',
  tags: [...TODO_TAG],
  description:
    'Maintain the task list for a multi-step job. ' +
    'While exploring/drafting: send the COMPLETE list each time (full replace). ' +
    'During approved plan execution: only update status on the current assigned approved step ' +
    '(at most one status change) — do not add, remove, reorder, rewrite step text, or change other steps. ' +
    'Mark exactly one task in_progress while you work it, mark it completed when done. ' +
    'Persists to plans/todos.json alongside the plan file. ' +
    'Statuses: pending | in_progress | completed | cancelled. ' +
    'While exploring (before exit_plan_mode), use only pending or in_progress — not completed. ' +
    'Include success_criteria for every step and verify_command when an objective check exists ' +
    '(e.g. npm test, test -f path/to/file).',
  inputSchema: z.object({
    todos: z
      .array(trackedTodoInputSchema)
      .min(1)
      .describe(
        'Task list. Exploring: full replace. Approved execution: same step texts as the plan; only statuses may change.',
      ),
  }),
  needsApproval: false,
  async execute(input) {
    const conversationId = getConversationIdFromEnv()
    const sandboxRoot = getSandboxRootFromEnv()
    if (!conversationId && !sandboxRoot) {
      return {
        error:
          'No active sandbox; task tracking is only available during an agent run.',
      }
    }

    const parsed = z
      .object({
        todos: z.array(trackedTodoInputSchema),
      })
      .safeParse(input)
    if (!parsed.success) {
      return { error: 'Invalid todos input.', detail: parsed.error.flatten() }
    }

    const exploreBlocked = explorePhaseTodoUpdateBlockedReason(
      conversationId,
      parsed.data.todos,
    )
    if (exploreBlocked) {
      return { error: exploreBlocked }
    }

    const existing = loadTodoList()
    const resolved = resolveTodoListUpdate({
      conversationId,
      existing,
      incoming: parsed.data.todos,
    })
    if (!resolved.ok) {
      return { error: resolved.error }
    }

    const list = resolved.list
    persistTodoList(list)
    const summary = summarizeTodos(list)

    return {
      ok: true,
      todos: list.todos,
      summary,
      checklist: renderTodoChecklist(list),
      ...(summary.allDone
        ? { done: true, message: UPDATE_TODOS_ALL_DONE_MESSAGE }
        : {}),
    }
  },
}

export const readTodos: SkillTool = {
  name: 'read_todos',
  tags: [...TODO_TAG],
  description:
    'Read the current task list from plans/todos.json (alongside the plan file). Use it to re-orient on a long task.',
  inputSchema: z.object({}),
  needsApproval: false,
  async execute() {
    const conversationId = getConversationIdFromEnv()
    const sandboxRoot = getSandboxRootFromEnv()
    if (!conversationId && !sandboxRoot) {
      return { error: 'No active sandbox.' }
    }
    const list = loadTodoList()
    if (!list) return { error: 'No active sandbox.' }
    return {
      ok: true,
      todos: list.todos,
      summary: summarizeTodos(list),
      checklist: renderTodoChecklist(list),
    }
  },
}

export const todoTools: SkillTool[] = [updateTodos, readTodos]
