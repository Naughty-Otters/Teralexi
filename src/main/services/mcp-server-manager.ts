import {
  createMCPClient,
  Experimental_StdioMCPTransport,
  type MCPClient,
} from '@openfde-ai/mcp'
import { createLogger, instrumentInstanceMethods } from '@main/logger'
import type { StoredMcpServer } from './conversation-store'
import {
  resolveRuntimeMcpServer,
  type McpServerRuntimeContext,
} from './mcp-server-runtime'

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema?: unknown
}

const log = createLogger('services.mcp-server-manager')

class McpServerManager {
  private readonly clients = new Map<
    string,
    { fingerprint: string; client: MCPClient }
  >()

  private fingerprint(server: StoredMcpServer): string {
    return JSON.stringify({
      transportType: server.transportType,
      url: server.url,
      command: server.command,
      args: server.args,
      env: server.env,
      headers: server.headers,
    })
  }

  private async createClient(server: StoredMcpServer): Promise<MCPClient> {
    if (server.transportType === 'stdio') {
      if (!server.command.trim()) {
        throw new Error(`MCP server ${server.name} is missing command`)
      }

      return createMCPClient({
        transport: new Experimental_StdioMCPTransport({
          command: server.command,
          args: server.args,
          env: Object.keys(server.env).length > 0 ? server.env : undefined,
        }),
      })
    }

    if (!server.url.trim()) {
      throw new Error(`MCP server ${server.name} is missing URL`)
    }

    return createMCPClient({
      transport: {
        type: server.transportType,
        url: server.url,
        headers: Object.keys(server.headers).length > 0 ? server.headers : undefined,
      },
    })
  }

  private async getClient(
    server: StoredMcpServer,
    context?: McpServerRuntimeContext,
  ): Promise<MCPClient> {
    const runtimeServer = resolveRuntimeMcpServer(server, context)
    const nextFingerprint = this.fingerprint(runtimeServer)
    const cached = this.clients.get(server.id)

    if (cached && cached.fingerprint === nextFingerprint) {
      return cached.client
    }

    if (cached) {
      await cached.client.close().catch(() => undefined)
      this.clients.delete(server.id)
    }

    const client = await this.createClient(runtimeServer)
    this.clients.set(server.id, {
      fingerprint: nextFingerprint,
      client,
    })

    return client
  }

  async listTools(
    server: StoredMcpServer,
    context?: McpServerRuntimeContext,
  ): Promise<McpToolDefinition[]> {
    const client = await this.getClient(server, context)
    const result = await client.listTools()

    return (result.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description?.trim() || tool.name,
      inputSchema: tool.inputSchema,
    }))
  }

  async callTool(
    server: StoredMcpServer,
    toolName: string,
    input: unknown,
    context?: McpServerRuntimeContext,
  ): Promise<unknown> {
    const client = await this.getClient(server, context)
    const tools = await client.tools()
    const targetTool = tools[toolName]

    if (!targetTool) {
      throw new Error(`MCP tool not found: ${toolName}`)
    }

    return targetTool.execute(input as any, {
      messages: [],
      toolCallId: `${server.id}:${toolName}:${Date.now()}`,
    } as any)
  }

  async closeClient(serverId: string): Promise<void> {
    const cached = this.clients.get(serverId)
    if (!cached) return
    this.clients.delete(serverId)
    await cached.client.close().catch(() => undefined)
  }

  async closeAll(): Promise<void> {
    const entries = [...this.clients.entries()]
    this.clients.clear()
    await Promise.all(
      entries.map(([, cached]) => cached.client.close().catch(() => undefined)),
    )
  }
}

let _manager: McpServerManager | null = null

export function getMcpServerManager(): McpServerManager {
  if (!_manager) {
    _manager = instrumentInstanceMethods(new McpServerManager(), log)
  }
  return _manager
}
