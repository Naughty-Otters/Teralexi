import { MCPRegistryClient } from 'mcp-registry-spec-sdk'
import { createLogger, instrumentInstanceMethods } from '@main/logger'
import {
  dedupeRegistryEntries,
  listRegistryServerDrafts,
  pickPreferredRegistryDraft,
  toRegistryServerSummary,
} from '@shared/mcp/registry-config-mapper'
import type {
  McpRegistrySearchResult,
  McpRegistryServerDraft,
  McpRegistryServerSummary,
  McpRegistryTransportType,
} from '@shared/mcp/registry-types'

const log = createLogger('services.mcp-registry')

const DEFAULT_REGISTRY_BASE_URL = 'https://registry.modelcontextprotocol.io'

class McpRegistryService {
  private readonly client: MCPRegistryClient

  constructor(baseUrl = DEFAULT_REGISTRY_BASE_URL) {
    this.client = new MCPRegistryClient(baseUrl)
  }

  async searchServers(input: {
    search?: string
    cursor?: string
    limit?: number
  }): Promise<McpRegistrySearchResult> {
    const response = await this.client.server.listServers({
      search: input.search?.trim() || undefined,
      cursor: input.cursor,
      limit: input.limit ?? 20,
      version: 'latest',
    })

    const deduped = dedupeRegistryEntries(response.servers ?? [])
    const servers = deduped
      .map((entry) => toRegistryServerSummary(entry))
      .filter((item): item is McpRegistryServerSummary => item !== null)

    return {
      servers,
      nextCursor: response.metadata?.nextCursor,
    }
  }

  async getServerDrafts(input: {
    serverName: string
    version?: string
    preferredTransport?: McpRegistryTransportType
  }): Promise<{
    summary: McpRegistryServerSummary
    drafts: McpRegistryServerDraft[]
    preferredDraft: McpRegistryServerDraft | null
  }> {
    const response = await this.client.server.getServerVersion(
      input.serverName,
      input.version?.trim() || 'latest',
    )

    const entry = { server: response.server, _meta: response._meta }
    const summary = toRegistryServerSummary(entry)
    if (!summary) {
      throw new Error(`Registry server not found: ${input.serverName}`)
    }

    const drafts = listRegistryServerDrafts(entry)
    const preferredDraft = pickPreferredRegistryDraft(
      drafts,
      input.preferredTransport,
    )

    return {
      summary,
      drafts,
      preferredDraft,
    }
  }
}

let _service: McpRegistryService | null = null

export function getMcpRegistryService(): McpRegistryService {
  if (!_service) {
    _service = instrumentInstanceMethods(new McpRegistryService(), log)
  }
  return _service
}

export { McpRegistryService }
