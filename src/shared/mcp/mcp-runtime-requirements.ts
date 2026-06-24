export type McpRuntimeKind = 'npx' | 'uvx'

export const NODEJS_INSTALL_URL = 'https://nodejs.org/en/download'
export const UV_INSTALL_URL =
  'https://docs.astral.sh/uv/getting-started/installation/'

const UV_REFERENCE_SERVER_IDS = new Set(['ref-mcp-fetch', 'ref-mcp-time'])

/** How a stdio MCP server is launched (if it needs a host runtime). */
export function mcpRuntimeKindForCommand(command: string): McpRuntimeKind | null {
  const normalized = command.trim().toLowerCase()
  if (normalized === 'npx' || normalized === 'npm') return 'npx'
  if (normalized === 'uvx' || normalized === 'uv') return 'uvx'
  return null
}

export function referenceMcpRuntimeKind(server: {
  id: string
  command: string
}): McpRuntimeKind | null {
  if (UV_REFERENCE_SERVER_IDS.has(server.id)) return 'uvx'
  return mcpRuntimeKindForCommand(server.command)
}

export function mcpRuntimeInstallUrl(kind: McpRuntimeKind): string {
  return kind === 'uvx' ? UV_INSTALL_URL : NODEJS_INSTALL_URL
}

/** Human-readable launch command for reference server tooltips. */
export function describeMcpLaunchCommand(server: {
  command: string
  args: readonly string[]
}): string {
  const command = server.command.trim()
  const args = server.args.map((arg) => arg.trim()).filter(Boolean)
  if (!command) return ''
  return [command, ...args].join(' ')
}
