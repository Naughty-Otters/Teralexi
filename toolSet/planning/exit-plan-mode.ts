import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  planModeStorageOptionsFromEnv,
  readPlanModeTodoList,
  resolvePlanModeStorage,
} from '@main/agent/coding/plan-mode-storage-impl'
import { planModeFor } from '@main/agent/coding/plan-mode-state'
import {
  emptyTodoList,
  renderTodoChecklist,
  summarizeTodos,
} from '@shared/agent/todos'
import { getConversationIdFromEnv } from '../sandbox-paths'
import { EXIT_PLAN_MODE_TOOL_NAME, PLANNING_TAG } from './constants'
import {
  planMarkdownHasActionableSteps,
  seedTodosFromPlan,
} from './plan-utils'
import { buildAndPersistExploreManifest } from '@main/agent/coding/explore-manifest'
import { syncPlanFileFromTodoContents } from './plan-sync'
import type { TrackedTodo } from '@shared/agent/todos'

function planTodoWarnings(todos: TrackedTodo[]): string[] {
  const warnings: string[] = []
  for (const [index, todo] of todos.entries()) {
    if (!todo.success_criteria?.trim()) {
      warnings.push(
        `Step ${index + 1} ("${todo.content}") has no success_criteria — execution will use a generic verifier only.`,
      )
    }
  }
  return warnings
}

export const exitPlanMode: SkillTool = {
  name: EXIT_PLAN_MODE_TOOL_NAME,
  tags: [...PLANNING_TAG],
  description:
    'Exit explore mode and request user approval to execute the plan. Requires actionable plan steps or tasks in plans/todos.json.',
  inputSchema: z.object({
    summary: z
      .string()
      .optional()
      .describe('One-paragraph summary of the plan for the approval prompt.'),
  }),
  needsApproval: false,
  async execute(input) {
    const conversationId = getConversationIdFromEnv()
    if (!conversationId) {
      return { error: 'exit_plan_mode requires an active conversation.' }
    }

    const parsed = z.object({ summary: z.string().optional() }).safeParse(input)
    const summary = parsed.success ? parsed.data.summary?.trim() : undefined

    const storageOptions = planModeStorageOptionsFromEnv(conversationId)
    const storage = resolvePlanModeStorage(conversationId, storageOptions)
    const existingList = readPlanModeTodoList(conversationId, storageOptions)

    const planExists =
      storage != null && existsSync(storage.planFile.absolutePath)

    let planContent = ''
    if (planExists && storage) {
      try {
        planContent = readFileSync(storage.planFile.absolutePath, 'utf8')
      } catch {
        planContent = ''
      }
    }

    let hasActionableSteps = planContent
      ? planMarkdownHasActionableSteps(planContent)
      : false

    if (!hasActionableSteps && existingList.todos.length > 0) {
      syncPlanFileFromTodoContents(conversationId, existingList.todos)
      if (storage) {
        try {
          planContent = readFileSync(storage.planFile.absolutePath, 'utf8')
          hasActionableSteps = planMarkdownHasActionableSteps(planContent)
        } catch {
          hasActionableSteps = false
        }
      }
    }

    const seed =
      planExists &&
      storage &&
      hasActionableSteps &&
      existingList.todos.length === 0
        ? seedTodosFromPlan(storage.planFile.absolutePath)
        : { seeded: 0 }

    const finalList =
      readPlanModeTodoList(conversationId, storageOptions) ?? emptyTodoList()
    const todoCount = finalList.todos.length

    if (!hasActionableSteps && seed.seeded === 0 && todoCount === 0) {
      return {
        error:
          'Cannot exit explore mode: call update_todos with plan steps and/or write the plan file under plans/ before exiting.',
      }
    }

    planModeFor(conversationId).activateExecution({
      trigger: 'tool:exit_plan_mode',
      reason: summary || 'Plan ready for execution.',
    })

    if (storage?.planFile.slug) {
      buildAndPersistExploreManifest(
        conversationId,
        storage.planFile.slug,
        storageOptions,
      )
    }

    const warnings = planTodoWarnings(finalList.todos)

    return {
      ok: true,
      status: 'plan_tool_execute',
      planSlug: storage?.planFile.slug,
      planFilePath: storage?.planFile.displayPath,
      todosFilePath: storage?.todosFile.displayPath,
      planMarkdown: planContent || undefined,
      todosSeeded: seed.seeded,
      todos: finalList.todos,
      summary: summarizeTodos(finalList),
      checklist: renderTodoChecklist(finalList),
      ...(warnings.length > 0 ? { warnings } : {}),
      planSummary: summary || 'Plan ready for execution.',
      approvalSummary: summary || 'Plan ready for execution.',
      message:
        'Plan approved. The agent will execute tasks one-by-one from the approved plan.',
    }
  },
}
