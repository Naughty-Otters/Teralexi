import { existsSync, statSync } from 'fs'
import * as os from 'os'
import { join, resolve } from 'path'
import {
  conversationWorkspaceStack,
  type WorkspaceEntry,
} from '@shared/agent/workspace'
import { getConversationStore } from '@main/services/conversation-store'

export type WorkspacePathValidationResult =
  | { ok: true; path: string }
  | { ok: false; error: string }

export type WorkspaceMutationResult =
  | {
      ok: true
      stack: WorkspaceEntry[]
      workspacePath: string | null
    }
  | { ok: false; error: string }

const cache = new Map<string, string | null>()

function expandUserPath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (trimmed === '~') return os.homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return join(os.homedir(), trimmed.slice(2))
  }
  return trimmed
}

export function validateWorkspaceDirectoryPath(
  rawPath: string,
): WorkspacePathValidationResult {
  const trimmed = expandUserPath(rawPath)
  if (!trimmed) {
    return { ok: false, error: 'Workspace path must be a non-empty string.' }
  }

  let abs: string
  try {
    abs = resolve(trimmed)
  } catch (err) {
    return { ok: false, error: String(err) }
  }

  if (!existsSync(abs)) {
    return { ok: false, error: `Workspace folder does not exist: ${abs}` }
  }

  let stat
  try {
    stat = statSync(abs)
  } catch (err) {
    return { ok: false, error: String(err) }
  }

  if (!stat.isDirectory()) {
    return { ok: false, error: `Workspace path is not a directory: ${abs}` }
  }

  return { ok: true, path: abs }
}

function persistPath(
  conversationId: string,
  workspacePath: string | null,
): void {
  const id = conversationId.trim()
  if (!id) return
  getConversationStore().setConversationWorkspacePath(id, workspacePath)
  cache.set(id, workspacePath)
}

export function loadConversationWorkspace(conversationId: string): string | null {
  const id = conversationId.trim()
  if (!id) return null
  if (cache.has(id)) return cache.get(id) ?? null

  const row = getConversationStore().getConversationSettings(id)
  const path = row?.workspacePath?.trim() || null
  cache.set(id, path)
  return path
}

export function getWorkspacePath(conversationId: string): string | null {
  const id = conversationId.trim()
  if (!id) return null
  if (!cache.has(id)) return loadConversationWorkspace(id)
  return cache.get(id) ?? null
}

export function getWorkspaceStack(conversationId: string): WorkspaceEntry[] {
  return conversationWorkspaceStack(getWorkspacePath(conversationId))
}

export function setWorkspacePath(
  conversationId: string,
  rawPath: string,
): WorkspaceMutationResult {
  const id = conversationId.trim()
  if (!id) {
    return { ok: false, error: 'conversationId is required.' }
  }

  const validated = validateWorkspaceDirectoryPath(rawPath)
  if (!validated.ok) return validated

  persistPath(id, validated.path)
  const workspacePath = validated.path
  return {
    ok: true,
    stack: conversationWorkspaceStack(workspacePath),
    workspacePath,
  }
}

export function clearWorkspacePath(
  conversationId: string,
): WorkspaceMutationResult {
  const id = conversationId.trim()
  if (!id) {
    return { ok: false, error: 'conversationId is required.' }
  }

  persistPath(id, null)
  return {
    ok: true,
    stack: conversationWorkspaceStack(null),
    workspacePath: null,
  }
}

/** Drop cached path after external store changes (tests). */
export function resetConversationWorkspaceCache(conversationId?: string): void {
  if (conversationId?.trim()) {
    cache.delete(conversationId.trim())
    return
  }
  cache.clear()
}
