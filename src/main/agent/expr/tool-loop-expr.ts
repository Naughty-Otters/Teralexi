import { stepCountIs } from '@teralexi-ai'
import { resolveToolLoopMaxIterations } from '@shared/agent/tool-loop'
import type { AgentFlowContext, AgentStepContext } from '../context'
import { thinkingWantsDirectAnswer } from './thinking-utils'
import { updateTodosAllDoneSpinStopWhen } from './update-todos-stop'
import { mergeExpressionPlans } from './merge-expression-plans'
import { expressionPlanIsRunnable } from './expression-plan'
import { runExpressionPlanOnContext } from './expression-runner'
import { StepExpressionDefinitionBase } from './step-expr-base'
import type { StepRunContext } from '../flow/step-hook'
import {
  assembleInstructions,
  buildSkillsInstructionsBlock,
} from '../injection'
import {
  isPlanModeTodosAllDoneOnDisk,
  reconcilePlanExecutionStateFromDisk,
} from '../coding/plan-mode-execution-bridge'
import {
  TOOL_LOOP_STEP_ID,
  TOOL_LOOP_STEP_TITLE,
} from '../constants/step-ids'
import { runStandaloneAgent } from './tool-loop-standalone'

export { type TodoExecutionResult } from '../steps/todo-execution-types'
export {
  executeTodoToolLoop,
  type ExecuteTodoParams,
} from './tool-loop-todo'

/** @internal Exported for unit tests — builds the tool-loop tool map including invoke_* tools. */
export { buildAgentToolSet as buildAgentToolSetForTests } from './tool-loop-toolset'
export { publishToolLoopAttachmentsForParent } from './tool-loop-toolset'

export { buildSkillsInstructionsBlock }

// ─────────────────────────────────────────────────────────────────────────────
// Shared utilities
// ─────────────────────────────────────────────────────────────────────────────

type ToolLoopRunGate = Pick<
  AgentStepContext,
  'opts' | 'runtimeTools'
> &
  Pick<AgentFlowContext, 'outputStore' | 'stepOutputs'>

/** Whether the built-in tool-loop agent should run (skill or MCP tools present). */
export function toolLoopStageShouldRun(ctx: ToolLoopRunGate): boolean {
  if (thinkingWantsDirectAnswer(ctx)) return false
  const flowCtx = ctx as AgentFlowContext
  if (flowCtx.opts?.conversationId) {
    reconcilePlanExecutionStateFromDisk(flowCtx)
    if (isPlanModeTodosAllDoneOnDisk(flowCtx)) return false
  }
  const tools = ctx.runtimeTools ?? []
  return (
    (Boolean(ctx.opts?.skillId) ||
      tools.some((tool) => tool.source === 'mcp')) &&
    tools.length > 0
  )
}

/** Exported for regression tests — iteration budget + allDone update_todos spin break. */
export function resolveToolLoopStopWhen(flowCtx: AgentStepContext) {
  const maxIterations = resolveToolLoopMaxIterations(
    flowCtx.executionSteps?.toolLoop?.maxIterations ??
      flowCtx.opts.toolLoopMaxIterations,
  )
  // Iteration budget always applies. Also break when the model spins on
  // update_todos after the list is already allDone (common with toolChoice loops).
  // We no longer halt after a single run_script/run_script_file so the agent can
  // chain build → test → fix.
  return [stepCountIs(maxIterations), updateTodosAllDoneSpinStopWhen()]
}

export function resolveToolLoopMaxTurns(flowCtx: AgentStepContext): number {
  return resolveToolLoopMaxIterations(
    flowCtx.executionSteps?.toolLoop?.maxIterations ??
      flowCtx.opts.toolLoopMaxIterations,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Expression-based tool-loop step definition (pipeline runner)
// ─────────────────────────────────────────────────────────────────────────────

class ToolLoopStepDefinition extends StepExpressionDefinitionBase {
  readonly id = TOOL_LOOP_STEP_ID
  readonly title = TOOL_LOOP_STEP_TITLE

  shouldRun(run: StepRunContext): boolean {
    return toolLoopStageShouldRun(run.flow)
  }

  protected defaultInstruction(ctx: AgentStepContext): string {
    return assembleInstructions(ctx, 'toolLoop')
  }

  buildUserPrompt(ctx: AgentStepContext): string {
    return ctx.getLatestUserMessageContent()
  }

  async execute(ctx: AgentStepContext): Promise<void> {
    const mergedPlan = this.buildPlan(ctx)
    const override = ctx.flowStepConfig?.expressionPlan
    if (override && expressionPlanIsRunnable(override)) {
      const plan = mergeExpressionPlans(mergedPlan, override)
      await runExpressionPlanOnContext(
        ctx,
        TOOL_LOOP_STEP_ID,
        TOOL_LOOP_STEP_TITLE,
        plan,
      )
      return
    }
    await runStandaloneAgent(ctx)
  }
}

/** Run tool-loop stage via expression hooks (expression plan or tool-loop {@link Agent}). */
export async function executeToolLoopStage(
  ctx: AgentStepContext,
): Promise<void> {
  await new ToolLoopStepDefinition().execute(ctx)
}
