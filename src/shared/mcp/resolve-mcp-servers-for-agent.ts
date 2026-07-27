import { isAlwaysOnMcpServer } from './reference-mcp-servers'

export type McpServerAssignmentRef = {
  id: string
  enabled: boolean
}

export type AgentMcpAssignment = {
  availableMcpServers?: string[] | null
}

function isActiveMcpServer(server: McpServerAssignmentRef): boolean {
  return server.enabled || isAlwaysOnMcpServer(server)
}

/** Servers an agent may use: globally enabled (not paused) + agent allowlist. */
export function resolveMcpServersForAgent<T extends McpServerAssignmentRef>(
  allServers: readonly T[],
  availableMcpServers: string[] | null | undefined,
): T[] {
  const active = allServers.filter((server) => isActiveMcpServer(server))
  if (availableMcpServers == null) {
    return [...active]
  }
  const allowed = new Set(availableMcpServers)
  return active.filter(
    (server) => allowed.has(server.id) || isAlwaysOnMcpServer(server),
  )
}

/** Union of MCP server ids referenced by any agent assignment. */
export function unionMcpServerIdsForAgents(
  allServers: readonly McpServerAssignmentRef[],
  agents: readonly AgentMcpAssignment[],
): string[] {
  const activeIds = new Set(
    allServers.filter((server) => isActiveMcpServer(server)).map((server) => server.id),
  )
  if (activeIds.size === 0 || agents.length === 0) return []

  const union = new Set<string>()
  for (const agent of agents) {
    if (agent.availableMcpServers == null) {
      for (const id of activeIds) union.add(id)
      continue
    }
    for (const id of agent.availableMcpServers) {
      if (activeIds.has(id)) union.add(id)
    }
    for (const id of activeIds) {
      if (isAlwaysOnMcpServer({ id })) union.add(id)
    }
  }
  return [...union]
}
