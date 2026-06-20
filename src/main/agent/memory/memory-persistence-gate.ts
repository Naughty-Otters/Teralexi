import type { AgentFlowContext } from '../context'
import {
  PLANNING_STEP_ID,
  REPORT_STEP_ID,
  SKILLS_STEP_ID,
  SUMMARY_STEP_ID,
  TOOL_LOOP_STEP_ID,
} from '../constants/step-ids'
import type { PlanningResult } from '../types'
import type { AgentResponseOpts } from '../types'

function hasNonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function hasMeaningfulStepOutputs(stepOutputs: AgentFlowContext['stepOutputs']): boolean {
  if (hasNonEmptyText(stepOutputs.toolLoop)) return true
  if (hasNonEmptyText(stepOutputs.skills)) return true
  if (hasNonEmptyText(stepOutputs.report)) return true
  if (hasNonEmptyText(stepOutputs.summary?.finalAnswer)) return true
  if ((stepOutputs.planning?.todoList?.length ?? 0) > 0) return true
  return false
}

function hasMeaningfulOutputStore(
  outputStore: AgentFlowContext['outputStore'],
): boolean {
  if (!outputStore) return false
  if (outputStore.has(TOOL_LOOP_STEP_ID)) return true
  if (outputStore.has(SKILLS_STEP_ID)) return true
  if (outputStore.has(REPORT_STEP_ID)) return true
  if (outputStore.has(SUMMARY_STEP_ID)) return true
  const planning = outputStore.latest<PlanningResult>(PLANNING_STEP_ID)
  return (planning?.todoList?.length ?? 0) > 0
}

/** Whether this run should write to the agent memory repository. */
export function shouldPersistAgentMemoryForRun(
  opts: AgentResponseOpts,
  ctx: Pick<
    AgentFlowContext,
    | 'outputStore'
    | 'stepOutputs'
    | 'hitlAwaitingApproval'
    | 'hitlAwaitingFormData'
    | 'hitlAwaitingManualIntervention'
  >,
): boolean {
  if (opts.abortSignal?.aborted) return false
  if (ctx.hitlAwaitingApproval) return false
  if (ctx.hitlAwaitingFormData) return false
  if (ctx.hitlAwaitingManualIntervention) return false

  return (
    hasMeaningfulStepOutputs(ctx.stepOutputs) ||
    hasMeaningfulOutputStore(ctx.outputStore)
  )
}
