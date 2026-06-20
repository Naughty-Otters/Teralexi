import type { AgentFlowContext } from '../context'
import type { StepExpressionHarnessContext } from './expression-plan'

export type StepWhenHarnessPreset = keyof typeof STEP_WHEN_HARNESS_PRESETS

/** Named harness checks on LLM `generateText` / `streamText` output. */
export const STEP_WHEN_HARNESS_PRESETS = {
  nonEmpty: (_ctx: AgentFlowContext, harness: StepExpressionHarnessContext) =>
    Boolean(harness.text.trim()),
  hasJson: (_ctx: AgentFlowContext, harness: StepExpressionHarnessContext) => {
    try {
      JSON.parse(harness.text.trim())
      return true
    } catch {
      return false
    }
  },
} as const satisfies Record<
  string,
  (ctx: AgentFlowContext, harness: StepExpressionHarnessContext) => boolean
>

export type StepWhenHarnessInput =
  | StepWhenHarnessPreset
  | string
  | ((
      ctx: AgentFlowContext,
      harness: StepExpressionHarnessContext,
    ) => boolean)

export function resolveWhenHarnessCondition(
  condition: StepWhenHarnessInput,
): (ctx: AgentFlowContext, harness: StepExpressionHarnessContext) => boolean {
  if (typeof condition === 'function') return condition
  const preset = STEP_WHEN_HARNESS_PRESETS[condition as StepWhenHarnessPreset]
  if (preset) return preset
  throw new Error(
    `Unknown when harness preset "${condition}". Known: ${Object.keys(STEP_WHEN_HARNESS_PRESETS).join(', ')}`,
  )
}
