import {
  isPlanExecutionActive,
  isPlanModeActive,
  planModeStorageOptionsFromEnv,
  type PlanModeStorageOptions,
} from './plan-mode-state'
import { hasPersistedPlanTodos } from './plan-mode-execution-bridge'

/**
 * When non-null, `enter_plan_mode` must not run (explore already active, executing
 * an approved plan, or an on-disk todos.json plan already exists).
 */
export function enterPlanModeBlockedReason(
  conversationId: string | undefined,
  options?: PlanModeStorageOptions,
): string | null {
  const id = conversationId?.trim()
  if (!id) return null

  const storageOptions = options ?? planModeStorageOptionsFromEnv(id)

  if (isPlanModeActive(id)) {
    return (
      'Exploring is already active. Use update_todos to revise the task list, ' +
      'then exit_plan_mode when the plan is ready for approval.'
    )
  }

  if (isPlanExecutionActive(id)) {
    return (
      'Approved plan execution is in progress. Do not call enter_plan_mode — finish the current task, ' +
      'then reply with a brief summary. Use update_todos to revise the task list if needed.'
    )
  }

  if (hasPersistedPlanTodos(id, storageOptions)) {
    return (
      'A plan already exists in plans/todos.json. Do not call enter_plan_mode again — ' +
      'use update_todos to revise tasks, or clear explore mode to start over.'
    )
  }

  return null
}
