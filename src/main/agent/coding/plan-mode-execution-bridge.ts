import type { AgentFlowContext, AgentStepContext } from '../context'
import { runForEachItemBatch } from '../steps/foreach-item/batch-runner'
import { createPlannedTodoStrategy } from '../steps/foreach-item/strategies/planned-todo-strategy'
import {
  reconcilePlanExecutionStateFromDisk,
  shouldRunPlanTodoForeach,
} from './plan-mode-todo-sync'

export * from './plan-mode-todo-sync'

/** Run approved-plan todo foreach after `exit_plan_mode` (same turn as HITL resume). */
export async function runApprovedPlanTodoForeach(
  ctx: AgentFlowContext | AgentStepContext,
): Promise<boolean> {
  reconcilePlanExecutionStateFromDisk(ctx)
  if (!shouldRunPlanTodoForeach(ctx as AgentFlowContext)) return false
  // Static import required: a dynamic import('../steps/...') is left as a
  // filesystem path by Rollup and fails inside app.asar
  // (Cannot find module '.../dist/electron/steps/foreach-item/...').
  const strategy = createPlannedTodoStrategy({ preset: 'hasPlanModeTodos' })
  await runForEachItemBatch(ctx as AgentStepContext, strategy)
  return true
}
