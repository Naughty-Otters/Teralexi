import type { AgentFlowContext } from '../context'
import type { AgentFlowBase } from './agent-flow-base'
import type { FlowConditionalBranch, PipelineEntry } from './pipeline'
import { FlowBranchCollector } from './flow-branch-collector'

/** Fluent `when(condition).then_branch(...).else_branch(...)`. */
export class FlowConditionalElseBuilder {
  constructor(
    private readonly parent: AgentFlowBase,
    private readonly predicate: (ctx: AgentFlowContext) => boolean,
    private readonly afterLinearIndex: number,
    private readonly thenEntries: PipelineEntry[],
    private readonly spawnBranch: () => FlowBranchCollector,
    private readonly registerConditional: (branch: FlowConditionalBranch) => void,
  ) {}

  /** Stages when the condition is false; omit `configure` for an empty else branch. */
  else_branch(configure?: (branch: FlowBranchCollector) => FlowBranchCollector): AgentFlowBase {
    const elseEntries = configure
      ? [...configure(this.spawnBranch()).entries]
      : []
    this.registerConditional({
      afterLinearIndex: this.afterLinearIndex,
      when: this.predicate,
      then: this.thenEntries,
      else: elseEntries,
    })
    return this.parent
  }
}

export class FlowConditionalBuilder {
  constructor(
    private readonly parent: AgentFlowBase,
    private readonly predicate: (ctx: AgentFlowContext) => boolean,
    private readonly afterLinearIndex: number,
    private readonly spawnBranch: () => FlowBranchCollector,
    private readonly registerConditional: (branch: FlowConditionalBranch) => void,
  ) {}

  then_branch(
    configure: (branch: FlowBranchCollector) => FlowBranchCollector,
  ): FlowConditionalElseBuilder {
    const thenEntries = [...configure(this.spawnBranch()).entries]
    return new FlowConditionalElseBuilder(
      this.parent,
      this.predicate,
      this.afterLinearIndex,
      thenEntries,
      this.spawnBranch,
      this.registerConditional,
    )
  }
}
