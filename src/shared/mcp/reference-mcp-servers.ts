export type ReferenceMcpServerDefinition = {
  id: string
  name: string
  transportType: 'http' | 'sse' | 'stdio'
  command: string
  args: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
  enabled?: boolean
}

/** Official MCP reference servers from https://github.com/modelcontextprotocol/servers */
export const REFERENCE_MCP_SERVER_DEFINITIONS: ReferenceMcpServerDefinition[] = [
  {
    id: 'ref-mcp-everything',
    name: 'Everything',
    transportType: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything'],
    enabled: false,
  },
  {
    id: 'ref-mcp-fetch',
    name: 'Fetch',
    transportType: 'stdio',
    command: 'uvx',
    args: ['mcp-server-fetch'],
    enabled: false,
  },
  {
    id: 'ref-mcp-filesystem',
    name: 'Filesystem',
    transportType: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    enabled: false,
  },
  {
    id: 'ref-mcp-memory',
    name: 'Memory',
    transportType: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    enabled: false,
  },
  {
    id: 'ref-mcp-time',
    name: 'Time',
    transportType: 'stdio',
    command: 'uvx',
    args: ['mcp-server-time'],
    enabled: false,
  },
  {
    id: 'ref-mcp-sequential-thinking',
    name: 'Sequential Thinking',
    transportType: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    enabled: false,
  },
]

const REFERENCE_MCP_SERVER_IDS = new Set(
  REFERENCE_MCP_SERVER_DEFINITIONS.map((definition) => definition.id),
)

export function isReferenceMcpServer(server: { id: string }): boolean {
  return REFERENCE_MCP_SERVER_IDS.has(server.id)
}
