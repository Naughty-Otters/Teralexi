import { FlowPipelineRegistry } from './pipeline'


/** Registry used by {@link AgentFlow} to resolve stage ids from the fluent pipeline to runners. */
export function createFlowStageRegistry(): FlowPipelineRegistry {
  return new FlowPipelineRegistry()
}
