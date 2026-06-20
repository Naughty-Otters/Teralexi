import type { StepExpressionPlan } from './expression-plan'

/** Merge fluent overrides from `flow.step(id, expr)` into a step default plan. */
export function mergeExpressionPlans(
  base: StepExpressionPlan,
  override?: StepExpressionPlan,
): StepExpressionPlan {
  if (!override) return base
  return {
    instructions: override.instructions ?? base.instructions,
    userPrompt: override.userPrompt ?? base.userPrompt,
    precondition: override.precondition ?? base.precondition,
    whenHarness: override.whenHarness ?? base.whenHarness,
    tool: override.tool ?? base.tool,
    elseTool: override.elseTool ?? base.elseTool,
    elseGoto: override.elseGoto ?? base.elseGoto,
    verify: override.verify ?? base.verify,
    title: override.title ?? base.title,
  }
}
