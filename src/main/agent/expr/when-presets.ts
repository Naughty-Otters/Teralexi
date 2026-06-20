import type { AgentFlowContext } from '../context'
import {
  PROMPT_STEP_ID,
  THINKING_STEP_ID,
  TOOL_LOOP_STEP_ID,
} from '../constants/step-ids'
import {
  latestThinkingStepData,
  thinkingWantsDirectAnswer,
  thinkingWantsPlanning,
} from './thinking-utils'

export type StepWhenPreset = keyof typeof STEP_WHEN_PRESETS

/** Named pipeline predicates for {@link StepExpression.when}. */
export const STEP_WHEN_PRESETS = {
  hasThinking: (ctx: AgentFlowContext) =>
    ctx.outputStore?.has(THINKING_STEP_ID) ?? Boolean(ctx.stepOutputs.thinking?.raw?.trim()),
  thinkingIsAgentCall: (ctx: AgentFlowContext) =>
    latestThinkingStepData(ctx)?.execution_mode === 'agent_call',
  thinkingIsDirectAnswer: (ctx: AgentFlowContext) =>
    thinkingWantsDirectAnswer(ctx),
  thinkingWantsPlanning: (ctx: AgentFlowContext) => thinkingWantsPlanning(ctx),
  hasToolLoop: (ctx: AgentFlowContext) =>
    ctx.outputStore?.has(TOOL_LOOP_STEP_ID) ?? Boolean(ctx.stepOutputs.toolLoop?.trim()),
  hasPrompt: (ctx: AgentFlowContext) =>
    ctx.outputStore?.has(PROMPT_STEP_ID) ?? Boolean(ctx.stepOutputs.prompt?.trim()),
} as const satisfies Record<string, (ctx: AgentFlowContext) => boolean>

export function resolveStepWhenCondition(
  condition: string | ((ctx: AgentFlowContext) => boolean),
): (ctx: AgentFlowContext) => boolean {
  if (typeof condition === 'function') return condition
  const preset = STEP_WHEN_PRESETS[condition as StepWhenPreset]
  if (preset) return preset
  throw new Error(
    `Unknown step when preset "${condition}". Known presets: ${Object.keys(STEP_WHEN_PRESETS).join(', ')}`,
  )
}
