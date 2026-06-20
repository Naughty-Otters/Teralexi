export type AgentRunDepthContext = {
  agentRun?: { meta?: { depth?: number } }
}

/** True when this {@link AgentRun} is a nested sub-agent (not the root conversation run). */
export function isSubAgentAgentRun(
  ctx?: AgentRunDepthContext | null,
): boolean {
  const depth = ctx?.agentRun?.meta?.depth
  return typeof depth === 'number' && depth > 0
}
