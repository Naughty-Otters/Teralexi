import { randomShortUuid } from '@shared/utils/short-uuid'
import { unionMcpServerIdsForAgents } from '@shared/mcp/resolve-mcp-servers-for-agent'
import { DEFAULT_USER_ID } from './config'
import type { AgentStoreContext } from './agent-store-context'
import type { Agent, McpServerDefinition, McpToolDefinition, McpTransportType } from './types'

export function createMcpServerActions(ctx: AgentStoreContext) {
  const { log, agents, mcpServers, mcpToolsByServer, mcpToolsLoadErrorByServer } = ctx

  async function fetchMcpServerTools(
    serverId: string,
  ): Promise<McpToolDefinition[]> {
    const channel = window.ipcRendererChannel?.GetMcpServerTools
    if (!channel?.invoke) return []
    const tools = (await channel.invoke({
      userId: DEFAULT_USER_ID,
      serverId,
    })) as McpToolDefinition[]
    return Array.isArray(tools) ? tools : []
  }

  function formatMcpToolLoadError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim()
    if (typeof error === 'string' && error.trim()) return error.trim()
    return 'Failed to load MCP server tools.'
  }

  function clearMcpToolsLoadError(serverId: string): void {
    if (!(serverId in mcpToolsLoadErrorByServer.value)) return
    const next = { ...mcpToolsLoadErrorByServer.value }
    delete next[serverId]
    mcpToolsLoadErrorByServer.value = next
  }

  async function loadMcpToolsForServerIds(serverIds: readonly string[]): Promise<void> {
    const uniqueIds = [...new Set(serverIds.filter(Boolean))]
    if (uniqueIds.length === 0) return

    const results = await Promise.allSettled(
      uniqueIds.map(async (serverId) => ({
        serverId,
        tools: await fetchMcpServerTools(serverId),
      })),
    )

    const nextToolsMap = { ...mcpToolsByServer.value }
    const nextErrors = { ...mcpToolsLoadErrorByServer.value }
    for (let i = 0; i < results.length; i++) {
      const serverId = uniqueIds[i]
      const result = results[i]
      if (!serverId || !result) continue

      if (result.status === 'fulfilled') {
        nextToolsMap[result.value.serverId] = result.value.tools
        delete nextErrors[result.value.serverId]
        continue
      }

      const server = mcpServers.value.find((entry) => entry.id === serverId)
      log.warn('Failed to load MCP server tools', {
        serverId,
        serverName: server?.name,
        err: result.reason,
      })
      nextToolsMap[serverId] = []
      nextErrors[serverId] = formatMcpToolLoadError(result.reason)
    }

    mcpToolsByServer.value = nextToolsMap
    mcpToolsLoadErrorByServer.value = nextErrors
  }

  async function refreshMcpServerTools(serverId: string): Promise<void> {
    const server = mcpServers.value.find((entry) => entry.id === serverId)
    try {
      const tools = await fetchMcpServerTools(serverId)
      mcpToolsByServer.value = {
        ...mcpToolsByServer.value,
        [serverId]: tools,
      }
      clearMcpToolsLoadError(serverId)
    } catch (error) {
      mcpToolsByServer.value = {
        ...mcpToolsByServer.value,
        [serverId]: [],
      }
      mcpToolsLoadErrorByServer.value = {
        ...mcpToolsLoadErrorByServer.value,
        [serverId]: formatMcpToolLoadError(error),
      }
      log.warn('Failed to load MCP server tools', {
        serverId,
        serverName: server?.name,
        err: error,
      })
    }
  }

  /** Load MCP server registry from disk (Settings → MCP). Does not connect to servers. */
  async function loadMcpServers(): Promise<void> {
    const channel = window.ipcRendererChannel?.ListMcpServers
    if (!channel?.invoke) {
      mcpServers.value = []
      mcpToolsByServer.value = {}
      mcpToolsLoadErrorByServer.value = {}
      return
    }

    const servers = (await channel.invoke({
      userId: DEFAULT_USER_ID,
    })) as McpServerDefinition[]

    mcpServers.value = Array.isArray(servers) ? servers : []
  }

  async function loadMcpToolsForAssignedAgents(
    agentList: readonly Pick<Agent, 'availableMcpServers'>[] = agents.value,
  ): Promise<void> {
    const serverIds = unionMcpServerIdsForAgents(mcpServers.value, agentList)
    await loadMcpToolsForServerIds(serverIds)
  }

  async function addMcpServer(input: {
    name: string
    transportType: McpTransportType
    url?: string
    command?: string
    args?: string[]
    env?: Record<string, string>
    headers?: Record<string, string>
    enabled?: boolean
  }): Promise<void> {
    const channel = window.ipcRendererChannel?.CreateMcpServer
    if (!channel?.invoke) return

    const id = randomShortUuid()
    await channel.invoke({
      id,
      userId: DEFAULT_USER_ID,
      name: input.name,
      transportType: input.transportType,
      url: input.url ?? '',
      command: input.command ?? '',
      args: input.args ?? [],
      env: input.env ?? {},
      headers: input.headers ?? {},
      enabled: input.enabled ?? true,
    })

    await loadMcpServers()
    if (input.enabled !== false) {
      await refreshMcpServerTools(id)
    }
  }

  async function toggleMcpServerEnabled(serverId: string): Promise<void> {
    const target = mcpServers.value.find((server) => server.id === serverId)
    if (!target) return

    const enabled = !target.enabled
    const channel = window.ipcRendererChannel?.SetMcpServerEnabled
    if (!channel?.invoke) return

    await channel.invoke({
      userId: DEFAULT_USER_ID,
      serverId,
      enabled,
    })

    target.enabled = enabled

    if (enabled) {
      await refreshMcpServerTools(serverId)
      return
    }

    delete mcpToolsByServer.value[serverId]
    clearMcpToolsLoadError(serverId)
  }

  async function deleteMcpServer(serverId: string): Promise<void> {
    const channel = window.ipcRendererChannel?.DeleteMcpServer
    if (!channel?.invoke) return

    await channel.invoke({
      userId: DEFAULT_USER_ID,
      serverId,
    })

    mcpServers.value = mcpServers.value.filter(
      (server) => server.id !== serverId,
    )
    delete mcpToolsByServer.value[serverId]
    clearMcpToolsLoadError(serverId)
  }

  return {
    fetchMcpServerTools,
    refreshMcpServerTools,
    loadMcpToolsForServerIds,
    loadMcpServers,
    loadMcpToolsForAssignedAgents,
    addMcpServer,
    toggleMcpServerEnabled,
    deleteMcpServer,
  }
}

export function loadMcpServers(ctx: AgentStoreContext): Promise<void> {
  return createMcpServerActions(ctx).loadMcpServers()
}
