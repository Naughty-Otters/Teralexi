import type { AgentFlowContext } from '../../context'
import {
  reconcilePlanExecutionStateFromDisk,
  shouldRunPlanTodoForeach,
} from '../../coding/plan-mode-execution-bridge'
import type { AgentFlowBase } from '../agent-flow-base'

/** Builds a linear + conditional pipeline on an {@link AgentFlowBase} instance. */
export interface AgentFlowPipelineRecipe {
  apply(flow: AgentFlowBase): void
}

/**
 * Default ReAct pipeline: tool loop with optional plan-todo foreach.
 * Task complexity in normal mode may auto-enter explore mode at tool-loop start
 * (see {@link maybeAutoActivatePlanMode}); no separate Thinking step.
 */
export class ReactAgentPipeline implements AgentFlowPipelineRecipe {
  apply(flow: AgentFlowBase): void {
    flow
      .begin()
      .when((ctx: AgentFlowContext) => {
        reconcilePlanExecutionStateFromDisk(ctx)
        return shouldRunPlanTodoForeach(ctx)
      })
      .then_branch((b) => b.forEachItem({ preset: 'hasPlanModeTodos' }))
      .else_branch((b) => {
        b.toolLoop()
        return b
      })
  }
}

/** @deprecated Use {@link ReactAgentPipeline}. Kept as alias for callers. */
export class DefaultAgentRunPipeline extends ReactAgentPipeline {}

/** Stages enabled by this agent's `executionSteps` config (tool work only). */
export class ConfigDrivenAgentPipeline implements AgentFlowPipelineRecipe {
  constructor(private readonly ctx: AgentFlowContext) {}

  apply(flow: AgentFlowBase): void {
    const steps = this.ctx.executionSteps
    const hasToolWork = (steps?.toolLoop?.tools?.length ?? 0) > 0

    if (!steps || !hasToolWork) {
      new ReactAgentPipeline().apply(flow)
      return
    }

    new ReactAgentPipeline().apply(flow)
  }
}
