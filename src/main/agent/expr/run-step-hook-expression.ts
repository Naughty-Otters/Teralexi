import type { AgentStepContext } from '../context'
import { resolveHarnessBranch } from './execute-expression'
import { runExpressionLlmText } from './run-expression-llm'
import type { ResolvedExpressionDefinition } from './step-expr-base'
import type { StepHookResult } from './step-hook-types'

/** Run one expression LLM pass using fully resolved {@link StepHookBase} hooks. */
export async function runResolvedExpressionStep(
  ctx: AgentStepContext,
  hooks: ResolvedExpressionDefinition,
): Promise<void> {
  const plan = hooks.buildPlan(ctx)
  const displayTitle = plan.title?.trim() || hooks.title
  const stepGoal = hooks.resolveStepGoal(ctx)

  ctx.beginStep(hooks.id, displayTitle, undefined, stepGoal)
  await hooks.onStart(ctx, plan)

  const messages = hooks.buildMessages(ctx)
  const body = await runExpressionLlmText(
    ctx,
    plan,
    messages,
    hooks.resolveLlmOptions(ctx, plan),
  )

  const { gotoStageId } = resolveHarnessBranch(plan, ctx, body)
  if (gotoStageId) {
    const formatted = hooks.formatBody(body, ctx)
    hooks.recordResult(ctx, {
      body,
      formatted,
      plan,
      displayTitle,
      stepGoal,
    })
    ctx.requestPipelineGoto(gotoStageId)
    return
  }

  const formatted = hooks.formatBody(body, ctx)

  const result: StepHookResult = {
    body,
    formatted,
    plan,
    displayTitle,
    stepGoal,
  }

  hooks.recordResult(ctx, result)
}
