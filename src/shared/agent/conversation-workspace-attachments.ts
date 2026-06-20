import type { UIMessage } from '@openfde-ai'
import { isFileChangeToolName } from '@shared/file-change/types'
import { parseToolFileChanges } from '@shared/file-change/parse-tool-file-changes'
import { isLikelyBinaryFilePath } from './non-binary-file'
import {
  buildFilePreviewUrl,
  dedupeStepAttachments,
  mergeStepAttachments,
  resolveFileChangeAbsolutePath,
  type StepAttachment,
} from './step-attachment'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toolPartName(part: unknown): string {
  const row = asRecord(part)
  if (!row) return ''
  if (row.type === 'dynamic-tool' && typeof row.toolName === 'string') {
    return row.toolName
  }
  if (typeof row.type === 'string' && row.type.startsWith('tool-')) {
    return row.type.slice('tool-'.length)
  }
  return ''
}

function toolPartOutput(part: unknown): unknown {
  const row = asRecord(part)
  return row?.output
}

function toolPartHasCompletedOutput(part: unknown): boolean {
  const row = asRecord(part)
  const state = typeof row?.state === 'string' ? row.state : ''
  return state === 'output-available' || state === 'output-error'
}

function isToolPart(part: unknown): boolean {
  const row = asRecord(part)
  if (!row || typeof row.type !== 'string') return false
  return row.type === 'dynamic-tool' || row.type.startsWith('tool-')
}

export function isWorkspaceFileChangePreview(preview: {
  workspacePath?: string
}): boolean {
  return Boolean(preview.workspacePath?.trim())
}

export function isNonBinaryWorkspaceFileChange(preview: {
  path: string
  diff: string
  workspacePath?: string
}): boolean {
  if (!isWorkspaceFileChangePreview(preview)) return false
  if (isLikelyBinaryFilePath(preview.path)) return false
  return preview.diff.trim().length > 0
}

function previewToAttachment(
  preview: ReturnType<typeof parseToolFileChanges>[number],
  sandboxRoot?: string,
): StepAttachment | null {
  if (!isNonBinaryWorkspaceFileChange(preview)) return null

  const displayPath = preview.path.trim()
  const absPath = resolveFileChangeAbsolutePath(preview, sandboxRoot)
  if (!absPath) return null

  const label = displayPath.split('/').pop() || displayPath
  const url =
    preview.action === 'delete' ? undefined : buildFilePreviewUrl(absPath)

  return {
    path: absPath,
    label,
    displayPath,
    url,
    action: preview.action,
    additions: preview.additions,
    deletions: preview.deletions,
  }
}

function attachmentsFromToolPart(part: unknown): StepAttachment[] {
  const name = toolPartName(part)
  if (!isFileChangeToolName(name)) return []
  if (!toolPartHasCompletedOutput(part)) return []

  const output = toolPartOutput(part)
  const root = asRecord(output)
  const sandboxRoot =
    typeof root?.sandboxRoot === 'string' ? root.sandboxRoot : undefined

  const out: StepAttachment[] = []
  for (const preview of parseToolFileChanges(output)) {
    const attachment = previewToAttachment(preview, sandboxRoot)
    if (attachment) out.push(attachment)
  }
  return out
}

/**
 * Union of non-binary workspace file changes across all tool results in a conversation.
 * Later changes to the same path replace earlier ones.
 *
 * Sandbox-only outputs are intentionally excluded here; they continue to appear in
 * per-step Files attachment bubbles via {@link extractAttachmentsFromToolResult}.
 */
export function collectConversationWorkspaceAttachments(
  messages: readonly UIMessage[],
): StepAttachment[] {
  let merged: StepAttachment[] = []
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolPart(part)) continue
      merged = mergeStepAttachments(merged, attachmentsFromToolPart(part))
    }
  }
  return dedupeStepAttachments(merged)
}
