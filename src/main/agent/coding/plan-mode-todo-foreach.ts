import type { AgentFlowContext, AgentStepContext } from '../context'
import { runForEachItemBatch } from '../steps/foreach-item/batch-runner'
import {
  reconcilePlanExecutionStateFromDisk,
  shouldRunPlanTodoForeach,
} from './plan-mode-todo-sync'
import { getPlannedTodoStrategyFactory } from './plan-mode-todo-strategy-registry'

/**
 * Run approved-plan todo foreach after `exit_plan_mode` (same turn as HITL resume).
 *
 * Uses a registered factory instead of importing planned-todo-strategy directly
 * so we avoid the init cycle:
 *   bridge → strategy → step-helpers → @toolSet/planning → enter-guard → bridge
 * and avoid asar-breaking dynamic import() paths under production obfuscation.
 */
export async function runApprovedPlanTodoForeach(
  ctx: AgentFlowContext | AgentStepContext,
): Promise<boolean> {
  reconcilePlanExecutionStateFromDisk(ctx)
  if (!shouldRunPlanTodoForeach(ctx as AgentFlowContext)) return false
  const createPlannedTodoStrategy = getPlannedTodoStrategyFactory()
  const strategy = createPlannedTodoStrategy({ preset: 'hasPlanModeTodos' })
  await runForEachItemBatch(ctx as AgentStepContext, strategy)
  return true
}
