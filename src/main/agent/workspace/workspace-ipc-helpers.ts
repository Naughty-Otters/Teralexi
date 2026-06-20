import { existsSync } from 'fs'
import { isConversationRunInFlight } from '@main/engine'
import {
  getOrCreateSandboxForConversation,
  resolveSandboxRootForConversation,
} from '@main/agent/sandbox/registry'
import {
  getWorkspacePath,
  loadConversationWorkspace,
  validateWorkspaceDirectoryPath,
} from './conversation-workspace'
import { resolvePathInsideWorkspace } from './git-service'

export type ResolveWorkspaceCwdResult =
  | { ok: true; cwd: string }
  | { ok: false; error: string }

export type ResolveFilesCwdResult =
  | { ok: true; cwd: string; source: 'workspace' | 'sandbox' }
  | { ok: false; error: string }

const RUN_IN_FLIGHT_ERROR =
  'Cannot change workspace or git state while the agent is running for this conversation.'

/**
 * Resolves the validated workspace directory for a conversation (server-side).
 */
export function resolveWorkspaceCwd(
  conversationId: string,
  options: { blockIfRunInFlight?: boolean } = {},
): ResolveWorkspaceCwdResult {
  const id = conversationId?.trim()
  if (!id) {
    return { ok: false, error: 'conversationId is required.' }
  }

  if (options.blockIfRunInFlight && isConversationRunInFlight(id)) {
    return { ok: false, error: RUN_IN_FLIGHT_ERROR }
  }

  loadConversationWorkspace(id)
  const stored = getWorkspacePath(id)
  if (!stored?.trim()) {
    return {
      ok: false,
      error: 'No workspace folder is set for this conversation.',
    }
  }

  const validated = validateWorkspaceDirectoryPath(stored)
  if (!validated.ok) return validated

  return { ok: true, cwd: validated.path }
}

/**
 * Files panel cwd: user workspace when set, otherwise the conversation sandbox.
 */
export function resolveFilesCwd(conversationId: string): ResolveFilesCwdResult {
  const id = conversationId?.trim()
  if (!id) {
    return { ok: false, error: 'conversationId is required.' }
  }

  loadConversationWorkspace(id)
  const stored = getWorkspacePath(id)
  if (stored?.trim()) {
    const validated = validateWorkspaceDirectoryPath(stored)
    if (validated.ok) {
      return { ok: true, cwd: validated.path, source: 'workspace' }
    }
  }

  const sandboxRoot = resolveSandboxRootForConversation(id)
  if (!existsSync(sandboxRoot)) {
    return {
      ok: false,
      error:
        'Sandbox folder does not exist yet. Run the agent once to populate it.',
    }
  }

  return { ok: true, cwd: sandboxRoot, source: 'sandbox' }
}

/** Like {@link resolveFilesCwd} but creates the sandbox directory when missing. */
export async function ensureFilesCwd(
  conversationId: string,
): Promise<ResolveFilesCwdResult> {
  const resolved = resolveFilesCwd(conversationId)
  if (resolved.ok) return resolved

  const id = conversationId?.trim()
  if (!id) return resolved

  loadConversationWorkspace(id)
  if (getWorkspacePath(id)?.trim()) return resolved

  const sb = await getOrCreateSandboxForConversation(id)
  return { ok: true, cwd: sb.layout.root, source: 'sandbox' }
}

export type ResolveWorkspaceFileOpenResult =
  | { ok: true; cwd: string; absolutePath: string }
  | { ok: false; error: string }

export function resolveWorkspaceFileOpen(
  conversationId: string,
  relativePath: string,
): ResolveWorkspaceFileOpenResult {
  const cwdResult = resolveWorkspaceCwd(conversationId)
  if (!cwdResult.ok) return cwdResult

  const fileResult = resolvePathInsideWorkspace(cwdResult.cwd, relativePath)
  if (!fileResult.ok) return fileResult

  return { ok: true, cwd: cwdResult.cwd, absolutePath: fileResult.absolutePath }
}

export function resolveFilesFileOpen(
  conversationId: string,
  relativePath: string,
): ResolveWorkspaceFileOpenResult {
  const cwdResult = resolveFilesCwd(conversationId)
  if (!cwdResult.ok) return cwdResult

  const fileResult = resolvePathInsideWorkspace(cwdResult.cwd, relativePath)
  if (!fileResult.ok) return fileResult

  return { ok: true, cwd: cwdResult.cwd, absolutePath: fileResult.absolutePath }
}
