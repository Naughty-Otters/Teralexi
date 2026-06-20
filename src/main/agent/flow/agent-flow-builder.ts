import type { AgentResponseOpts } from '../types'
import { AgentFlowContext } from '../context'
import { createFlowStageRegistry } from './stage-runners'
import type { FlowPipelineRegistry } from './pipeline'
import { AgentFlow } from './agent-flow'
import type { AgentFlowBase } from './agent-flow-base'
import {
  ConfigDrivenAgentPipeline,
  DefaultAgentRunPipeline,
  type AgentFlowPipelineRecipe,
} from './pipelines/agent-flow-pipeline'

/**
 * Builds an {@link AgentFlow} with a preset pipeline recipe applied up front.
 *
 * @example
 * ```ts
 * const flow = AgentFlowBuilder.create(opts, model)
 *   .withDefaultPipeline()
 *   .build()
 * ```
 */
export class AgentFlowBuilder {
  private recipe: AgentFlowPipelineRecipe | null = null
  private applyRecipeOnBuild = true

  private constructor(
    private readonly opts: AgentResponseOpts,
    private readonly model: unknown,
    private readonly registry: FlowPipelineRegistry = createFlowStageRegistry(),
    private readonly existingCtx?: AgentFlowContext,
  ) {}

  static create(
    opts: AgentResponseOpts,
    model: unknown,
    registry?: FlowPipelineRegistry,
  ): AgentFlowBuilder {
    return new AgentFlowBuilder(opts, model, registry)
  }

  /** Reuse an existing context (sub-runs, tests). */
  static withContext(ctx: AgentFlowContext, registry?: FlowPipelineRegistry): AgentFlowBuilder {
    return new AgentFlowBuilder(ctx.opts, {}, registry, ctx)
  }

  /** Full default agent run (tool loop ReAct; explore mode auto-activates for complex tasks in normal mode). */
  withDefaultPipeline(): this {
    this.recipe = new DefaultAgentRunPipeline()
    return this
  }

  /** Pipeline from agent `executionSteps` config (same as {@link AgentFlow.fromAgentConfig}). */
  withConfigPipeline(): this {
    this.recipe = null
    return this
  }

  /** Custom recipe; clears built-in preset selection. */
  withRecipe(recipe: AgentFlowPipelineRecipe): this {
    this.recipe = recipe
    return this
  }

  /**
   * When false, the recipe is not applied at build time (lazy via {@link AgentFlow.fromAgentConfig} on run).
   * Default: true when a recipe was set via `with*Pipeline` / `withRecipe`.
   */
  deferPipelineApplication(defer = true): this {
    this.applyRecipeOnBuild = !defer
    return this
  }

  build(): AgentFlow {
    const flow = new AgentFlow(
      this.opts,
      this.model,
      this.registry,
      this.existingCtx,
    )

    if (this.recipe === null) {
      return flow
    }

    if (this.applyRecipeOnBuild) {
      flow.applyPipeline(this.recipe)
    }

    return flow
  }

  /** Build and return the underlying {@link AgentFlowBase} for advanced customization. */
  buildBase(): AgentFlowBase {
    return this.build()
  }
}
