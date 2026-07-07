export type McpServerAssignmentRef = {
  id: string
  enabled: boolean
}

export type AgentMcpAssignment = {
  availableMcpServers?: string[] | null
}

/** Servers an agent may use: globally enabled (not paused) + agent allowlist. */
export function resolveMcpServersForAgent<T extends McpServerAssignmentRef>(
  allServers: readonly T[],
  availableMcpServers: string[] | null | undefined,
): T[] {
  const active = allServers.filter((server) => server.enabled)
  if (availableMcpServers == null) {
    return [...active]
  }
  const allowed = new Set(availableMcpServers)
  return active.filter((server) => allowed.has(server.id))
}

/** Union of MCP server ids referenced by any agent assignment. */
export function unionMcpServerIdsForAgents(
  allServers: readonly McpServerAssignmentRef[],
  agents: readonly AgentMcpAssignment[],
): string[] {
  const activeIds = new Set(
    allServers.filter((server) => server.enabled).map((server) => server.id),
  )
  if (activeIds.size === 0 || agents.length === 0) return []

  const union = new Set<string>()
  for (const agent of agents) {
    const ids =
      agent.availableMcpServers == null
        ? [...activeIds]
        : agent.availableMcpServers.filter((id) => activeIds.has(id))
    for (const id of ids) union.add(id)
  }
  return [...union]
}
