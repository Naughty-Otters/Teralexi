import type { AgentFlowContext } from '../context'
import type { FlowStageId } from '../constants/step-ids'

/** Context passed to {@link StepExpressionPlan.whenHarness} after the LLM text call. */
export type StepExpressionHarnessContext = {
  text: string
}

/** Result of running a full {@link StepExpression} pipeline inside one flow stage. */
export type StepExpressionRunResult = {
  text: string
  toolOutputs: unknown[]
  /** Which tool branch ran, if any. */
  toolUsed?: string
  whenHarnessPassed?: boolean
  /** Set when {@link StepExpressionPlan.elseGoto} runs after a failed harness. */
  gotoStageId?: FlowStageId
  success: boolean
  failureReason?: 'verify' | 'tool'
}

/**
 * Serialized expression — maps 1:1 to AI SDK / tool execution phases.
 *
 * | Expression method | Runtime use |
 * |-------------------|---------------|
 * | `system_msg` | `streamText` / `generateText` **`instructions`** |
 * | `prompt` | User message for that LLM call |
 * | `when` | Harness on LLM text — if true run `tool`, else run `else_tool` |
 * | `tool` | Direct tool call when `when` passes (or when omitted) |
 * | `else_tool` | Direct tool call when `when` fails |
 * | `else_goto` | Jump pipeline to an existing stage id when `when` fails |
 * | `verify` | Final success gate after LLM + optional tool |
 */
export type StepExpressionPlan = {
  instructions?: string
  userPrompt?: string
  precondition?: (ctx: AgentFlowContext) => boolean
  whenHarness?: (
    ctx: AgentFlowContext,
    harness: StepExpressionHarnessContext,
  ) => boolean
  /** Tool when harness passes (or always, if no `when`). */
  tool?: string
  /** Tool when harness fails. */
  elseTool?: string
  /** Pipeline stage to run next when harness fails (skips or re-runs stages). */
  elseGoto?: FlowStageId
  verify?: (
    ctx: AgentFlowContext,
    result: Omit<
      StepExpressionRunResult,
      'success' | 'failureReason' | 'toolUsed' | 'whenHarnessPassed'
    >,
  ) => boolean
  title?: string
}

/** True when a serialized expression has at least one runnable field. */
export function expressionPlanIsRunnable(
  plan: StepExpressionPlan | undefined,
): boolean {
  if (!plan) return false
  return (
    Boolean(plan.instructions?.trim()) ||
    Boolean(plan.userPrompt?.trim()) ||
    Boolean(plan.tool?.trim()) ||
    Boolean(plan.elseTool?.trim()) ||
    Boolean(plan.whenHarness) ||
    Boolean(plan.verify)
  )
}
