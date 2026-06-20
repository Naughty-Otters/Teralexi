import type { NormalizedExecutionSteps } from './execution-steps'

export type AgentWithCodingPipeline = {
  skillId?: string | null
  executionSteps?: NormalizedExecutionSteps | null
}

/**
 * @deprecated Global ReAct pipeline — no per-skill planning stage override needed.
 */
export function applyCodingDirectToolLoopPolicy(
  _agent: AgentWithCodingPipeline,
): void {
  // no-op: all skills use thinking → toolLoop
}
