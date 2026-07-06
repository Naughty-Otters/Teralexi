import {
  isStepExpression,
  type StepExpression,
  type StepExprFactory,
} from '../expr'
import { customPromptFlowStepDefinition } from '../expr/custom-prompt-expr'
import { buildThinkingPipelineEntry } from '../expr/thinking-expr'
import {
  FOREACH_ITEM_STEP_ID,
  PROMPT_STEP_ID,
  TOOL_LOOP_STEP_ID,
} from '../constants/step-ids'
import type { ForEachItemConfig } from '../steps/foreach-item-config'
import { foreachItemFlowStepDefinition } from '../steps/foreach-item-step'
import { buildPipelineEntry } from './pipeline-entry'
import type {
  FlowStageId,
  FlowStepConfig,
  PipelineEntry,
  ToolLoopRunOptions,
} from './pipeline'
import { resolvePipelineStepInput } from '../expr'
import { toolLoopFlowStepDefinition } from './tool-loop-flow-step'
import { teralexi } from './teralexi'
import type { CustomStepOptions } from './step-prompts'
import type { StepHook } from './pipeline'

/** Minimal sink for registering {@link PipelineEntry} rows (flow body or branch collector). */
export interface PipelineEntrySink {
  pushPipelineEntry(entry: PipelineEntry): void
}

/**
 * Fluent stage helpers for the ReAct pipeline and expression DSL.
 * Legacy planning / summary / report / research stages were removed.
 */
export class FlowFluentStages<T extends PipelineEntrySink> {
  constructor(private readonly sink: T) {}

  protected push(entry: PipelineEntry): T {
    this.sink.pushPipelineEntry(entry)
    return this.sink
  }

  protected pushStage(
    id: FlowStageId,
    runner: StepHook,
    input?: StepExpression | FlowStepConfig,
  ): T {
    return this.push(buildPipelineEntry(id, runner, input))
  }

  step(id: FlowStageId, input?: StepExpression | FlowStepConfig): T {
    return this.push(resolvePipelineStepInput(id, input))
  }

  customStep(options: CustomStepOptions): T {
    return this.pushStage(PROMPT_STEP_ID, customPromptFlowStepDefinition, {
      expressionPlan: {
        instructions: options.systemMessage,
        userPrompt: options.instructions,
        title: options.title,
      },
      systemMessage: options.systemMessage,
      instructions: options.instructions,
      title: options.title,
    })
  }

  thinking(
    input?: StepExpression | ((factory: StepExprFactory) => StepExpression),
  ): T {
    if (typeof input === 'function') {
      return this.push(buildThinkingPipelineEntry(input(teralexi.expr)))
    }
    return this.push(buildThinkingPipelineEntry(input))
  }

  toolLoop(
    input?:
      | StepExpression
      | ToolLoopRunOptions
      | ((factory: StepExprFactory) => StepExpression),
  ): T {
    if (typeof input === 'function') {
      return this.pushStage(
        TOOL_LOOP_STEP_ID,
        toolLoopFlowStepDefinition,
        input(teralexi.expr),
      )
    }
    if (isStepExpression(input)) {
      return this.pushStage(
        TOOL_LOOP_STEP_ID,
        toolLoopFlowStepDefinition,
        input,
      )
    }
    return this.pushStage(
      TOOL_LOOP_STEP_ID,
      toolLoopFlowStepDefinition,
      input ? { toolLoopRun: input } : undefined,
    )
  }

  /** Expression DSL only — not used by the default ReAct pipeline. */
  forEachItem(config: ForEachItemConfig): T {
    return this.pushStage(FOREACH_ITEM_STEP_ID, foreachItemFlowStepDefinition, {
      foreachItem: config,
    })
  }
}
