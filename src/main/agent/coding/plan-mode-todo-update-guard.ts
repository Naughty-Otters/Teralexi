import { getActivePlanTodoContent } from './active-plan-todo'
import { isPlanExecutionActive, isPlanModeActive } from './plan-mode-state'
import {
  mergeExecutionTodoStatuses,
  replaceTodos,
  type TodoList,
  type TrackedTodoInput,
} from '@shared/agent/todos'

/**
 * While explore (`planning`) is active, todos describe the draft plan — not finished work.
 * `completed` is only valid during approved execution (`plan_tool_execute`).
 */
export function explorePhaseTodoUpdateBlockedReason(
  conversationId: string | undefined,
  todos: readonly { status?: unknown }[],
): string | null {
  const id = conversationId?.trim()
  if (!id || !isPlanModeActive(id)) return null

  const hasCompleted = todos.some((todo) => todo.status === 'completed')
  if (!hasCompleted) return null

  return (
    'Exploring: keep todos pending or in_progress while drafting the plan. ' +
    'Mark tasks completed only after exit_plan_mode is approved and execution begins. ' +
    'Call exit_plan_mode when the plan is ready for approval.'
  )
}

/**
 * Apply `update_todos` input: full replace while exploring/drafting; status-only
 * merge onto the approved list during `plan_tool_execute` (pinned to the active
 * foreach step when one is bound).
 */
export function resolveTodoListUpdate(args: {
  conversationId: string | undefined
  existing: TodoList | null
  incoming: TrackedTodoInput[]
}): { ok: true; list: TodoList } | { ok: false; error: string } {
  const { conversationId, existing, incoming } = args
  if (
    conversationId &&
    isPlanExecutionActive(conversationId) &&
    existing &&
    existing.todos.length > 0
  ) {
    return mergeExecutionTodoStatuses(existing, incoming, {
      activeTodoContent: getActivePlanTodoContent(),
    })
  }
  return { ok: true, list: replaceTodos(incoming) }
}
