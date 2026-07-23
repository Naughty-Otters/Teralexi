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
import {
  buildPlaywrightMcpStdioLaunch,
  resolvePlaywrightMcpCliPath,
} from './playwright-mcp-launch'
import { getBrowserCdpEndpointHint } from '@main/agent/browser/browser-session'
import { isPackagedApp, resolveAppRoot } from '@main/config/app-paths'

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

function resolvePlaywrightMcpServer(server: StoredMcpServer): StoredMcpServer {
  const cdp = getBrowserCdpEndpointHint()
  const extraArgs = cdp ? ['--cdp-endpoint', cdp] : []
  const cliPath = resolvePlaywrightMcpCliPath(resolveAppRoot())

  if (!cliPath) {
    if (isPackagedApp()) {
      throw new Error(
        'Bundled Playwright MCP (@playwright/mcp) was not found in the app package. Rebuild/reinstall the app so the MCP package is shipped.',
      )
    }
    // Dev-only fallback when the package is missing from node_modules.
    const base: StoredMcpServer = {
      ...server,
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

  const launch = buildPlaywrightMcpStdioLaunch(cliPath, extraArgs)
  const base: StoredMcpServer = {
    ...server,
    command: launch.command,
    args: launch.args,
    env: {
      ...(server.env ?? {}),
      ...launch.env,
    },
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
