import type { AgentStepId } from '../types'
import type { AgentFlowContext, AgentStepContext } from '../context'
import type { FlowStageId } from '../flow/pipeline'
import type { StepRunContext } from '../flow/step-hook'
import { executeStepExpression } from './execute-expression'
import { expressionPlanIsRunnable } from './expression-plan'
import type { StepExpressionPlan } from './expression-plan'

function intersectToolNames(
  current: string[] | undefined,
  stepTools: string[],
): string[] {
  if (!current?.length) return [...stepTools]
  const allowed = new Set(stepTools)
  return current.filter((name) => allowed.has(name))
}

/** Narrow {@link AgentFlowContext.opts.availableSet} for a single tool-loop run. */
export async function withStepToolScope<T>(
  flow: AgentFlowContext,
  stepTools: string[] | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!stepTools?.length) return fn()

  const prev = flow.opts.availableSet
  flow.opts.availableSet = intersectToolNames(prev, stepTools)
  try {
    return await fn()
  } finally {
    flow.opts.availableSet = prev
  }
}

/** Run a {@link StepExpressionPlan} on an existing step context and record output. */
export async function runExpressionPlanOnContext(
  ctx: AgentStepContext,
  stageId: AgentStepId,
  title: string,
  plan: StepExpressionPlan,
): Promise<void> {
  const displayTitle = plan.title?.trim() || title
  ctx.beginStep(
    stageId,
    displayTitle,
    undefined,
    plan.userPrompt ?? plan.instructions,
  )

  const result = await executeStepExpression(ctx, plan)
  const rendered =
    result.text ||
    (result.toolOutputs.length > 0
      ? JSON.stringify(result.toolOutputs.at(-1), null, 2)
      : '')

  ctx.recordStepOutput(
    stageId,
    displayTitle,
    result,
    rendered,
    {
      expressionSuccess: result.success,
      failureReason: result.failureReason,
    },
    undefined,
    plan.userPrompt ?? plan.instructions,
    result.success ? 'ok' : (result.failureReason ?? 'failed'),
  )

  if (rendered.trim()) {
    ctx.appendAssistantTurn(rendered)
  }

  if (result.gotoStageId) {
    ctx.requestPipelineGoto(result.gotoStageId)
  }
}

/**
 * When the step config carries a runnable {@link StepExpressionPlan}, run it and record output.
 * Returns true if the expression path ran (caller should skip the default step implementation).
 */
export async function runExpressionPlanIfPresent(
  run: StepRunContext,
  stageId: FlowStageId,
  title: string,
): Promise<boolean> {
  const plan = run.config.expressionPlan
  if (!expressionPlanIsRunnable(plan)) return false

  const stepCtx = run.flow.createStepContext(
    stageId as AgentStepId,
    title,
    run.config,
  )
  await runExpressionPlanOnContext(stepCtx, stageId as AgentStepId, title, plan!)
  return true
}
