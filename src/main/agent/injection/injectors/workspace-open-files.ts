import {
  getEditorLspBridge,
  relativePathFromAbs,
} from '../../lsp/editor-lsp-bridge'
import { loadConversationWorkspace } from '../../workspace/conversation-workspace'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

/** Cap so a user with many tabs open doesn't flood the system prompt. */
export const MAX_OPEN_FILES_LISTED = 30

/** Distinct workspace-relative paths currently open in the user's editor. */
export function listWorkspaceOpenFiles(workspacePath: string): string[] {
  const docs =
    getEditorLspBridge().listOpenDocumentsForWorkspace(workspacePath)
  const rels = docs
    .map((doc) => relativePathFromAbs(workspacePath, doc.absPath) ?? doc.absPath)
    .map((rel) => rel.trim())
    .filter(Boolean)
  return [...new Set(rels)].sort((a, b) => a.localeCompare(b))
}

export function buildWorkspaceOpenFilesBlock(workspacePath: string): string {
  const rels = listWorkspaceOpenFiles(workspacePath)
  if (rels.length === 0) return ''

  const shown = rels.slice(0, MAX_OPEN_FILES_LISTED)
  const overflow =
    rels.length > shown.length
      ? [`- …and ${rels.length - shown.length} more open file(s)`]
      : []

  return [
    '=== OPEN EDITOR FILES ===',
    'Files the user currently has open in the editor for this workspace — likely the most relevant to the task:',
    ...shown.map((rel) => `- ${rel}`),
    ...overflow,
    '=== END OPEN EDITOR FILES ===',
  ].join('\n')
}

/**
 * Surfaces the files the user has open in the editor whenever a workspace folder
 * is set for the conversation. Helps the agent start near the code the user is
 * looking at instead of blind-scanning the repo.
 */
export const workspaceOpenFilesInjector: AgentInjector = {
  id: 'workspace-open-files',
  order: INJECTOR_ORDER.WORKSPACE_OPEN_FILES,
  applies({ ctx }) {
    const conversationId = ctx.opts.conversationId?.trim()
    if (!conversationId) return false
    return Boolean(loadConversationWorkspace(conversationId)?.trim())
  },
  injectInstructions({ ctx }) {
    const conversationId = ctx.opts.conversationId?.trim()
    if (!conversationId) return null
    const workspacePath = loadConversationWorkspace(conversationId)?.trim()
    if (!workspacePath) return null
    return buildWorkspaceOpenFilesBlock(workspacePath) || null
  },
}
