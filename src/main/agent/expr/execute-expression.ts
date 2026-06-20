import { createLogger } from '@main/logger'
import type { AgentFlowContext, AgentStepContext } from '../context'
import type { FlowStageId } from '../constants/step-ids'
import { callSkillToolDirect } from '../steps/step-helpers'
import type {
  StepExpressionPlan,
  StepExpressionRunResult,
} from './expression-plan'
import { runExpressionLlmText } from './run-expression-llm'

const log = createLogger('agent.expr.execute')

function toolInputFromHarness(text: string, toolName: string): Record<string, unknown> {
  return {
    prompt: text,
    tool: toolName,
  }
}

export type HarnessBranchResolution = {
  toolName?: string
  gotoStageId?: FlowStageId
  whenHarnessPassed?: boolean
}

/** After the expression LLM call: pick `tool`, `else_tool`, or `else_goto` from the harness. */
export function resolveHarnessBranch(
  plan: StepExpressionPlan,
  ctx: AgentFlowContext,
  text: string,
): HarnessBranchResolution {
  if (!plan.tool && !plan.elseTool && !plan.elseGoto) {
    return {}
  }

  if (!plan.whenHarness) {
    return { toolName: plan.tool, whenHarnessPassed: true }
  }

  const passed = plan.whenHarness(ctx, { text })
  if (passed) {
    return { toolName: plan.tool, whenHarnessPassed: true }
  }
  if (plan.elseGoto) {
    return { gotoStageId: plan.elseGoto, whenHarnessPassed: false }
  }
  return { toolName: plan.elseTool, whenHarnessPassed: false }
}

export function resolveToolForHarness(
  plan: StepExpressionPlan,
  ctx: AgentFlowContext,
  text: string,
): { toolName?: string; whenHarnessPassed?: boolean } {
  const branch = resolveHarnessBranch(plan, ctx, text)
  return {
    toolName: branch.toolName,
    whenHarnessPassed: branch.whenHarnessPassed,
  }
}

/**
 * Runs the expression pipeline for one flow stage:
 * 1. LLM `streamText` (instructions + user prompt)
 * 2. `when` harness on text → choose `tool` vs `else_tool` / `else_goto`
 * 3. `verify` on the combined result
 */
export async function executeStepExpression(
  ctx: AgentStepContext,
  plan: StepExpressionPlan,
): Promise<StepExpressionRunResult> {
  const skillId = ctx.skillId?.trim()
  if (!skillId) {
    throw new Error('executeStepExpression requires opts.skillId')
  }

  const baseMessages = [
    {
      role: 'user' as const,
      content: ctx.getLatestUserMessageContent(),
    },
    ...ctx.buildPipelineContextMessages({
      thinking: true,
      planning: true,
      execution: true,
      orderedExecution: true,
      summary: true,
    }),
  ]

  const text = await runExpressionLlmText(ctx, plan, baseMessages)

  const { toolName, gotoStageId, whenHarnessPassed } = resolveHarnessBranch(
    plan,
    ctx,
    text,
  )

  log.debug('Expression LLM phase complete', {
    stepId: ctx.stepId,
    textLength: text.length,
    whenHarnessPassed,
    toolName,
    gotoStageId,
  })

  if (gotoStageId) {
    return {
      text,
      toolOutputs: [],
      whenHarnessPassed,
      success: true,
      gotoStageId,
    }
  }

  const toolOutputs: unknown[] = []
  if (toolName) {
    try {
      const output = await callSkillToolDirect(
        skillId,
        toolName,
        toolInputFromHarness(text, toolName),
        ctx,
      )
      toolOutputs.push(output)
    } catch (err) {
      log.error('Expression tool call failed', {
        toolName,
        skillId,
        ...(err instanceof Error
          ? {
              errorName: err.name,
              errorMessage: err.message,
              errorStack: err.stack?.split('\n').slice(0, 12).join('\n'),
            }
          : { errorMessage: String(err) }),
      })
      return {
        text,
        toolOutputs,
        toolUsed: toolName,
        whenHarnessPassed,
        success: false,
        failureReason: 'tool',
      }
    }
  }

  const resultBody = {
    text,
    toolOutputs,
    toolUsed: toolName,
    whenHarnessPassed,
  }

  if (plan.verify && !plan.verify(ctx, resultBody)) {
    return {
      ...resultBody,
      success: false,
      failureReason: 'verify',
    }
  }

  return {
    ...resultBody,
    success: true,
  }
}
