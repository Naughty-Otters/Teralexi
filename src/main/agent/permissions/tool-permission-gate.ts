import {
  extractFileToolPaths,
  resolveFileToolPermissionKey,
  type FileToolPermissionAction,
} from '@toolSet/file-system/permission-keys'
import {
  requireActiveSandbox,
  getWorkspacePathFromEnv,
  resolvePathInContext,
} from '@toolSet/sandbox-paths'
import { getWorkspacePath } from '../workspace/conversation-workspace'

export type ToolPermissionDecision = {
  action: FileToolPermissionAction
  permissionKey: string
  reason?: string
}

function resolveWorkspaceForPermissionCheck(
  conversationId?: string | null,
): string | null {
  const fromRun = getWorkspacePathFromEnv()
  if (fromRun) return fromRun
  const id = conversationId?.trim()
  if (!id) return null
  return getWorkspacePath(id)
}

export function evaluateFileToolPermission(
  toolName: string,
  input: Record<string, unknown>,
  conversationId?: string | null,
): ToolPermissionDecision {
  const rule = resolveFileToolPermissionKey(toolName)
  if (!rule) {
    return { action: 'allow', permissionKey: 'unknown' }
  }

  const sandbox = requireActiveSandbox()
  if (sandbox.ok) {
    const workspacePath = resolveWorkspaceForPermissionCheck(conversationId)
    for (const relPath of extractFileToolPaths(toolName, input)) {
      try {
        resolvePathInContext(sandbox.root, workspacePath, relPath)
      } catch (err) {
        return {
          action: 'deny',
          permissionKey: 'external_path',
          reason:
            err instanceof Error
              ? err.message
              : `Path not allowed for ${toolName}: ${relPath}`,
        }
      }
    }
  }

  return {
    action: rule.defaultAction,
    permissionKey: rule.key,
  }
}

export function assertFileToolPermissionAllowed(
  toolName: string,
  input: Record<string, unknown>,
  conversationId?: string | null,
): ToolPermissionDecision {
  const decision = evaluateFileToolPermission(toolName, input, conversationId)
  if (decision.action === 'deny') {
    throw new Error(decision.reason ?? `Permission denied for tool ${toolName}`)
  }
  return decision
}
