import type { AgentResponseOpts } from '../types'
import { ProviderContext } from '../providers/context'
import { AgentFlowContext } from '../context'
import type { FlowPipelineRegistry } from './pipeline'
import { createFlowStageRegistry } from './stage-runners'
import { AgentFlowBase } from './agent-flow-base'
import { StageModelRegistry } from '../providers/stage-model-registry'
import { AgentRun } from '../run/agent-run'

export type {
  FlowStageId,
  FlowStepConfig,
  PipelineEntry,
  ToolLoopRunOptions,
  FlowPipelineRegistry,
  StepHook,
  StepRunContext,
  StepAfterHook,
} from './pipeline'
export type { CustomStepOptions, FlowStepPromptOverrides } from './step-prompts'
export type {
  ForEachItemConfig,
  ForEachItemCustomConfig,
  ForEachItemhasTodoItemsPreset,
} from '../steps/foreach-item-config'
export {
  forEachItemWithExpression,
  type ForEachItemExpressionOptions,
} from '../steps/foreach-item-run'
export { teralexi } from './teralexi'
export { AgentFlowBase } from './agent-flow-base'
export {
  type AgentFlowPipelineRecipe,
  ReactAgentPipeline,
  DefaultAgentRunPipeline,
  ConfigDrivenAgentPipeline,
} from './pipelines/agent-flow-pipeline'
export { ThinkingBranchComposer } from './pipelines/thinking-branches'

/**
 * Fluent agent pipeline. Prefer {@link AgentFlowBuilder} for preset pipelines;
 * use fluent methods on this class for custom chains.
 *
 * @example
 * ```ts
 * await AgentFlowBuilder.create(opts, model).withDefaultPipeline().build().run()
 * ```
 */
export class AgentFlow extends AgentFlowBase {
  constructor(
    opts: AgentResponseOpts,
    model: unknown,
    registry: FlowPipelineRegistry = createFlowStageRegistry(),
    existingCtx?: AgentFlowContext,
  ) {
    super(existingCtx ?? new AgentFlowContext(opts, model), registry)
  }

  /** @deprecated Prefer {@link AgentRun.execute}; kept for tests and direct flow use. */
  async run(): Promise<string> {
    const result = await AgentRun.forFlow(this).execute()
    return result.structuredContent
  }
}

export type StreamAgentResponseResult = {
  structuredContent: string
  shouldPersistMemory: boolean
  hitlPaused: boolean
}

export async function streamAgentResponse(
  opts: AgentResponseOpts,
): Promise<StreamAgentResponseResult> {
  const stageModels = StageModelRegistry.fromOpts(opts)
  const model = stageModels.getModel('default')
  const result = await AgentRun.startRoot(opts, model).execute()
  return {
    structuredContent: result.structuredContent,
    shouldPersistMemory: result.shouldPersistMemory,
    hitlPaused: result.hitlPaused,
  }
}
