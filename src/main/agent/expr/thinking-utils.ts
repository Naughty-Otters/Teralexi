import type { AgentFlowContext } from '../context'
import { isPlanModeActive } from '../coding/plan-mode-state'
import { isSubAgentAgentRun } from '../run/sub-agent-run-policy'
import { THINKING_STEP_ID } from '../constants/step-ids'
import type { ThinkingStepData } from '../steps/step-io'

export function latestThinkingStepData(
  ctx?: Pick<AgentFlowContext, 'outputStore' | 'stepOutputs'> | null,
): ThinkingStepData | undefined {
  if (!ctx) return undefined
  return (
    ctx.outputStore?.latest<ThinkingStepData>(THINKING_STEP_ID) ??
    (ctx.stepOutputs?.thinking
      ? ({
          raw: ctx.stepOutputs.thinking.raw,
          execution_mode: ctx.stepOutputs.thinking.execution_mode,
          goal: ctx.stepOutputs.thinking.goal,
          task: ctx.stepOutputs.thinking.task,
          context: ctx.stepOutputs.thinking.context,
          rationale: ctx.stepOutputs.thinking.rationale,
          response: ctx.stepOutputs.thinking.response,
        } satisfies ThinkingStepData)
      : undefined)
  )
}

export function thinkingWantsDirectAnswer(
  ctx?: Pick<AgentFlowContext, 'outputStore' | 'stepOutputs' | 'opts' | 'agentRun'> | null,
): boolean {
  if (isSubAgentAgentRun(ctx)) return false
  const conversationId = ctx?.opts?.conversationId?.trim()
  if (conversationId && isPlanModeActive(conversationId)) return false
  return latestThinkingStepData(ctx)?.execution_mode === 'direct_answer'
}

export function thinkingWantsPlanning(
  ctx?: Pick<AgentFlowContext, 'outputStore' | 'stepOutputs' | 'opts' | 'agentRun'> | null,
): boolean {
  if (isSubAgentAgentRun(ctx)) return false
  const thinking = latestThinkingStepData(ctx)
  if (thinking?.execution_mode === 'planning') return true
  const conversationId = ctx?.opts?.conversationId?.trim()
  return conversationId ? isPlanModeActive(conversationId) : false
}

export function thinkingWantsAgentCall(
  ctx?: Pick<AgentFlowContext, 'outputStore' | 'stepOutputs' | 'opts' | 'agentRun'> | null,
): boolean {
  if (isSubAgentAgentRun(ctx)) return true
  const conversationId = ctx?.opts?.conversationId?.trim()
  if (conversationId && isPlanModeActive(conversationId)) return false
  const mode = latestThinkingStepData(ctx)?.execution_mode
  return !mode || mode === 'agent_call'
}

/** @deprecated Research pipeline removed. */
export function thinkingWantsResearch(
  _thinking: ThinkingStepData | undefined,
): boolean {
  return false
}
