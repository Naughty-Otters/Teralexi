import { randomShortUuid } from '@shared/utils/short-uuid'
import { DEFAULT_USER_ID } from './config'
import type { AgentStoreContext } from './agent-store-context'
import type { McpServerDefinition, McpToolDefinition } from './types'

export function createMcpServerActions(ctx: AgentStoreContext) {
  const { log, mcpServers, mcpToolsByServer, mcpToolsLoadErrorByServer } = ctx

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

  async function loadMcpServers(opts?: { fetchTools?: boolean }): Promise<void> {
    const fetchTools = opts?.fetchTools ?? false
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

    if (!fetchTools) return

    const enabledServers = mcpServers.value.filter((server) => server.enabled)
    const results = await Promise.allSettled(
      enabledServers.map(async (server) => ({
        serverId: server.id,
        serverName: server.name,
        tools: await fetchMcpServerTools(server.id),
      })),
    )

    const nextToolsMap = { ...mcpToolsByServer.value }
    const nextErrors = { ...mcpToolsLoadErrorByServer.value }
    for (let i = 0; i < results.length; i++) {
      const server = enabledServers[i]
      const result = results[i]
      if (!server || !result) continue

      if (result.status === 'fulfilled') {
        nextToolsMap[result.value.serverId] = result.value.tools
        delete nextErrors[result.value.serverId]
        continue
      }

      log.warn('Failed to load MCP server tools', {
        serverId: server.id,
        serverName: server.name,
        err: result.reason,
      })
      nextToolsMap[server.id] = []
      nextErrors[server.id] = formatMcpToolLoadError(result.reason)
    }

    mcpToolsByServer.value = nextToolsMap
    mcpToolsLoadErrorByServer.value = nextErrors
  }

  async function loadMcpToolsForEnabledServers(): Promise<void> {
    await loadMcpServers({ fetchTools: true })
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

    await channel.invoke({
      id: randomShortUuid(),
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

    await loadMcpServers({ fetchTools: true })
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
    loadMcpServers,
    loadMcpToolsForEnabledServers,
    addMcpServer,
    toggleMcpServerEnabled,
    deleteMcpServer,
  }
}

export function loadMcpServers(
  ctx: AgentStoreContext,
  opts?: { fetchTools?: boolean },
): Promise<void> {
  return createMcpServerActions(ctx).loadMcpServers(opts)
}
