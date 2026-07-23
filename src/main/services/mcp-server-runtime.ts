import { mkdirSync } from 'node:fs'
import {
  resolvePlanSandboxRoot,
  stableSandboxRootForConversation,
} from '@main/agent/coding/plan-mode-storage-impl'
import { getWorkspacePath } from '@main/agent/workspace/conversation-workspace'
import type { StoredMcpServer } from './conversation-store'
import {
  buildFilesystemMcpArgs,
  isReferenceFilesystemMcpServer,
  resolveFilesystemMcpAllowedPaths,
} from '@shared/mcp/filesystem-mcp-paths'
import { isPlaywrightReferenceMcpServer } from '@shared/mcp/reference-mcp-servers'
import { resolvePlaywrightMcpCliPath } from './playwright-mcp-launch'
import { getBrowserCdpEndpointHint } from '@main/agent/browser/browser-session'
import { bundledBinDir } from '@main/agent/lsp/language-servers'

export type McpServerRuntimeContext = {
  userId?: string
  conversationId?: string
}

const FILESYSTEM_PREVIEW_CONVERSATION_ID = '__mcp-filesystem-preview__'

function resolveFilesystemSandboxRoot(conversationId?: string): string {
  const trimmed = conversationId?.trim()
  if (trimmed) {
    return (
      resolvePlanSandboxRoot(trimmed) ??
      stableSandboxRootForConversation(trimmed)
    )
  }

  return stableSandboxRootForConversation(FILESYSTEM_PREVIEW_CONVERSATION_ID)
}

function ensureAccessibleDirectories(paths: readonly string[]): void {
  for (const dir of paths) {
    mkdirSync(dir, { recursive: true })
  }
}

function resolveAppRootForNodeModules(): string | null {
  const binDir = bundledBinDir()
  if (!binDir) return null
  // …/node_modules/.bin → app root
  return binDir.replace(/[/\\]node_modules[/\\]\.bin\/?$/, '')
}

function resolvePlaywrightMcpServer(server: StoredMcpServer): StoredMcpServer {
  const cdp = getBrowserCdpEndpointHint()
  const extraArgs = cdp ? ['--cdp-endpoint', cdp] : []
  const cliPath = resolvePlaywrightMcpCliPath(resolveAppRootForNodeModules())

  const base: StoredMcpServer = cliPath
    ? {
        ...server,
        command: 'node',
        args: [cliPath, ...extraArgs],
      }
    : {
        ...server,
        // Fallback when the package is missing from node_modules.
        command: 'npx',
        args: ['-y', '@playwright/mcp', ...extraArgs],
      }

  if (!cdp) return base
  return {
    ...base,
    env: {
      ...(base.env ?? {}),
      PLAYWRIGHT_MCP_CDP_ENDPOINT: cdp,
      OPENFDE_BROWSER_CDP_URL: cdp,
    },
  }
}

export function resolveRuntimeMcpServer(
  server: StoredMcpServer,
  context?: McpServerRuntimeContext,
): StoredMcpServer {
  if (isPlaywrightReferenceMcpServer(server)) {
    return resolvePlaywrightMcpServer(server)
  }

  if (!isReferenceFilesystemMcpServer(server)) {
    return server
  }

  const conversationId = context?.conversationId?.trim()
  const sandboxRoot = resolveFilesystemSandboxRoot(conversationId)
  const workspacePath = conversationId ? getWorkspacePath(conversationId) : null
  const allowedPaths = resolveFilesystemMcpAllowedPaths({
    sandboxRoot,
    workspacePath,
  })

  if (allowedPaths.length === 0) {
    throw new Error(
      `Filesystem MCP server "${server.name}" requires at least one allowed directory.`,
    )
  }

  ensureAccessibleDirectories(allowedPaths)

  return {
    ...server,
    args: buildFilesystemMcpArgs(allowedPaths),
  }
}
