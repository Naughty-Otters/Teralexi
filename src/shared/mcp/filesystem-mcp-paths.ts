export const REFERENCE_MCP_FILESYSTEM_ID = 'ref-mcp-filesystem'

export const FILESYSTEM_MCP_BASE_ARGS = [
  '-y',
  '@modelcontextprotocol/server-filesystem',
] as const

export function isReferenceFilesystemMcpServer(server: { id: string }): boolean {
  return server.id === REFERENCE_MCP_FILESYSTEM_ID
}

export function resolveFilesystemMcpAllowedPaths(input: {
  sandboxRoot?: string | null
  workspacePath?: string | null
}): string[] {
  const paths: string[] = []
  const seen = new Set<string>()

  const sandbox = input.sandboxRoot?.trim()
  if (sandbox) {
    seen.add(sandbox)
    paths.push(sandbox)
  }

  const workspace = input.workspacePath?.trim()
  if (workspace && !seen.has(workspace)) {
    paths.push(workspace)
  }

  return paths
}

export function buildFilesystemMcpArgs(allowedPaths: readonly string[]): string[] {
  return [...FILESYSTEM_MCP_BASE_ARGS, ...allowedPaths]
}
