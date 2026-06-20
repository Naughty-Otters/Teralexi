import { existsSync, readFileSync } from 'node:fs'
import {
  planMarkdownHasActionableSteps,
  planModeStorageOptionsFromEnv,
  readPlanModeTodoList,
  resolvePlanModeStorage,
  type PlanModeStorageOptions,
} from './plan-mode-storage-impl'

export type PlanModeExitReadiness = {
  ready: boolean
  todoCount: number
  hasActionablePlanSteps: boolean
  planFilePath?: string
}

/** Whether the on-disk plan / todos are sufficient to call `exit_plan_mode`. */
export function assessPlanModeExitReadiness(
  conversationId: string | undefined,
  options?: PlanModeStorageOptions,
): PlanModeExitReadiness {
  const id = conversationId?.trim()
  if (!id) {
    return { ready: false, todoCount: 0, hasActionablePlanSteps: false }
  }

  const storageOptions = options ?? planModeStorageOptionsFromEnv(id)
  const storage = resolvePlanModeStorage(id, storageOptions)
  const existingList = readPlanModeTodoList(id, storageOptions)
  const todoCount = existingList.todos.length

  let hasActionablePlanSteps = false
  if (storage && existsSync(storage.planFile.absolutePath)) {
    try {
      const planContent = readFileSync(storage.planFile.absolutePath, 'utf8')
      hasActionablePlanSteps = planMarkdownHasActionableSteps(planContent)
    } catch {
      hasActionablePlanSteps = false
    }
  }

  return {
    ready: hasActionablePlanSteps || todoCount > 0,
    todoCount,
    hasActionablePlanSteps,
    planFilePath: storage?.planFile.displayPath,
  }
}
