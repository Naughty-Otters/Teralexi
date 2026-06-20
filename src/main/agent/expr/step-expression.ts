import type { AgentFlowContext } from '../context'
import type { FlowStageId } from '../constants/step-ids'
import type { FlowStepConfig, PipelineEntry } from '../flow/pipeline'
import type { StepExpressionPlan } from './expression-plan'
import { resolveStepWhenCondition, type StepWhenPreset } from './when-presets'
import {
  resolveWhenHarnessCondition,
  type StepWhenHarnessInput,
} from './when-harness-presets'

/** Pipeline skip before the stage runs (context-only). */
export type StepPreconditionInput =
  | StepWhenPreset
  | string
  | ((ctx: AgentFlowContext) => boolean)

/**
 * Fluent per-stage DSL for {@link AgentFlow.step}.
 *
 * Mapping to runtime (see {@link StepExpressionPlan}):
 * - `system_msg` → AI SDK **`instructions`** on `streamText` / `generateText`
 * - `prompt` → user message on that LLM call
 * - `when` → harness on LLM text — if true run `tool`, if false run `else_tool`
 * - `tool` → tool call when harness passes (or when `when` is omitted)
 * - `else_tool` → tool call when harness fails
 * - `else_goto` → jump pipeline to an existing stage when harness fails
 * - `verify` → final success of the whole expression (after tools)
 * - `precondition` → skip this pipeline entry when false (context only)
 */
export class StepExpression {
  private instructionsText?: string
  private userPromptText?: string
  private title?: string
  private preconditionFn?: (ctx: AgentFlowContext) => boolean
  private whenHarnessFn?: StepExpressionPlan['whenHarness']
  private toolId?: string
  private elseToolId?: string
  private elseGotoStageId?: FlowStageId
  private verifyFn?: StepExpressionPlan['verify']
  private extraConfig: FlowStepConfig = {}

  system_msg(message: string): this {
    this.instructionsText = message
    return this
  }

  prompt(message: string): this {
    this.userPromptText = message
    return this
  }

  named(title: string): this {
    this.title = title
    return this
  }

  precondition(condition: StepPreconditionInput): this {
    this.preconditionFn = resolveStepWhenCondition(condition)
    return this
  }

  /**
   * Harness on LLM text. When it passes, {@link tool} runs; when it fails, {@link else_tool} runs.
   */
  when(condition: StepWhenHarnessInput): this {
    this.whenHarnessFn = resolveWhenHarnessCondition(condition)
    return this
  }

  /** Tool call when {@link when} passes (or always if `when` is not set). */
  tool(toolId: string): this {
    this.toolId = toolId
    return this
  }

  /** Tool call when {@link when} fails. */
  else_tool(toolId: string): this {
    this.elseToolId = toolId
    return this
  }

  /** Jump pipeline execution to an existing stage when {@link when} fails. */
  else_goto(stageId: FlowStageId): this {
    this.elseGotoStageId = stageId
    return this
  }

  verify(predicate: NonNullable<StepExpressionPlan['verify']>): this {
    this.verifyFn = predicate
    return this
  }

  merge(config: FlowStepConfig): this {
    this.extraConfig = { ...this.extraConfig, ...config }
    return this
  }

  toPlan(): StepExpressionPlan {
    return {
      instructions: this.instructionsText,
      userPrompt: this.userPromptText,
      precondition: this.preconditionFn,
      whenHarness: this.whenHarnessFn,
      tool: this.toolId,
      elseTool: this.elseToolId,
      elseGoto: this.elseGotoStageId,
      verify: this.verifyFn,
      title: this.title,
    }
  }

  toConfig(): FlowStepConfig {
    const plan = this.toPlan()
    const config: FlowStepConfig = {
      ...this.extraConfig,
      expressionPlan: plan,
    }
    if (plan.instructions !== undefined) {
      config.systemMessage = plan.instructions
      config.instructions = plan.instructions
    }
    if (plan.userPrompt !== undefined) {
      config.userPrompt = plan.userPrompt
    }
    if (plan.title !== undefined) {
      config.title = plan.title
    }
    const stepTools = [plan.tool, plan.elseTool].filter(
      (t): t is string => Boolean(t?.trim()),
    )
    if (stepTools.length > 0) {
      config.stepTools = stepTools
    }
    if (plan.elseTool) {
      config.elseTool = plan.elseTool
    }
    return config
  }

  toPipelineEntry(stageId: FlowStageId): PipelineEntry {
    const plan = this.toPlan()
    return {
      id: stageId,
      config: this.toConfig(),
      ...(plan.precondition ? { when: plan.precondition } : {}),
    }
  }
}

export class StepExprFactory {
  system_msg(message: string): StepExpression {
    return new StepExpression().system_msg(message)
  }

  systemMessage(message: string): StepExpression {
    return this.system_msg(message)
  }

  prompt(message: string): StepExpression {
    return new StepExpression().prompt(message)
  }

  precondition(condition: StepPreconditionInput): StepExpression {
    return new StepExpression().precondition(condition)
  }

  when(condition: StepWhenHarnessInput): StepExpression {
    return new StepExpression().when(condition)
  }

  tool(toolId: string): StepExpression {
    return new StepExpression().tool(toolId)
  }

  else_tool(toolId: string): StepExpression {
    return new StepExpression().else_tool(toolId)
  }

  else_goto(stageId: FlowStageId): StepExpression {
    return new StepExpression().else_goto(stageId)
  }

  verify(predicate: NonNullable<StepExpressionPlan['verify']>): StepExpression {
    return new StepExpression().verify(predicate)
  }

  empty(): StepExpression {
    return new StepExpression()
  }
}

export const expr = new StepExprFactory()

export function isStepExpression(
  value: StepExpression | FlowStepConfig | undefined,
): value is StepExpression {
  return value instanceof StepExpression
}

export function resolvePipelineStepInput(
  stageId: FlowStageId,
  input?: StepExpression | FlowStepConfig,
): PipelineEntry {
  if (input instanceof StepExpression) {
    return input.toPipelineEntry(stageId)
  }
  return { id: stageId, config: input }
}
