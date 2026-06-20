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

export function resolveRuntimeMcpServer(
  server: StoredMcpServer,
  context?: McpServerRuntimeContext,
): StoredMcpServer {
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
