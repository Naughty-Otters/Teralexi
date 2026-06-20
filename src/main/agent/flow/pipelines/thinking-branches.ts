import type { AgentFlowBase } from '../agent-flow-base'
import { thinkingWantsDirectAnswer } from '../../expr/thinking-utils'

export type ThinkingBranchOptions = {
  runToolLoop: boolean
}

/**
 * Optional post-thinking branches for custom fluent pipelines.
 * Default {@link ReactAgentPipeline} applies the same direct-answer skip inline.
 */
export class ThinkingBranchComposer {
  static branchAfterThinking(
    flow: AgentFlowBase,
    options: ThinkingBranchOptions,
  ): void {
    flow
      .when((ctx) => thinkingWantsDirectAnswer(ctx))
      .then_branch(() => {})
      .else_branch((b) => {
        if (options.runToolLoop) b.toolLoop()
        return b
      })
  }
}
