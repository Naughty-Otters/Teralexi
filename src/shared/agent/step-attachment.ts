import {
  isFileChangeToolName,
  type FileChangeAction,
  type FileChangePreview,
} from '@shared/file-change/types'
import { parseToolFileChanges } from '@shared/file-change/parse-tool-file-changes'
import { isCaptureArtifactPath } from '@shared/agent/capture-artifact-path'

export type { FileChangeAction }

export type StepAttachment = {
  /** Absolute sandbox path when known. */
  path: string
  label: string
  /** Workspace-relative path for display when known. */
  displayPath?: string
  url?: string
  toolName?: string
  sizeBytes?: number
  action?: FileChangeAction
  additions?: number
  deletions?: number
  /** Unified diff text when this attachment came from a file-change tool. */
  diff?: string
  /** Source path when action is rename. */
  moveFrom?: string
}

export type StepOutputLink = {
  label: string
  url: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizePathKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function normalizeFileUrlToPathKey(url: string): string {
  const trimmed = url.trim()
  if (!trimmed.toLowerCase().startsWith('file:')) return ''
  const withoutScheme = trimmed.replace(/^file:\/\//i, '')
  let decoded = withoutScheme
  try {
    decoded = decodeURI(withoutScheme)
  } catch {
    decoded = withoutScheme
  }
  // file://sandbox/... vs file:///sandbox/... — treat as absolute path, not host.
  if (!decoded.startsWith('/') && !/^[A-Za-z]:/.test(decoded)) {
    decoded = `/${decoded}`
  }
  return normalizePathKey(decoded)
}

/** Stable key for deduping links that may use different file:// encodings. */
export function outputLinkDedupeKey(link: StepOutputLink): string {
  const url = link.url.trim()
  if (url) {
    const pathKey = normalizeFileUrlToPathKey(url)
    if (pathKey) return pathKey
    const key = normalizePathKey(url)
    if (key) return key
  }
  const labelKey = normalizePathKey(link.label.trim())
  return labelKey || url.toLowerCase()
}

function attachmentDedupeKey(attachment: StepAttachment): string {
  const urlKey = attachment.url?.trim()
    ? normalizeFileUrlToPathKey(attachment.url)
    : ''
  let pathKey = normalizePathKey(attachment.path)
  if (
    pathKey &&
    !pathKey.startsWith('/') &&
    !/^[a-z]:\//.test(pathKey)
  ) {
    pathKey = normalizePathKey(`/${attachment.path}`)
  }
  return urlKey || pathKey || normalizePathKey(attachment.label)
}

export function dedupeOutputLinks(
  links: readonly StepOutputLink[],
): StepOutputLink[] {
  const out: StepOutputLink[] = []
  const seen = new Set<string>()
  for (const link of links) {
    const key = outputLinkDedupeKey(link)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(link)
  }
  return out
}

export function dedupeStepAttachments(
  attachments: readonly StepAttachment[],
): StepAttachment[] {
  return mergeStepAttachments([], attachments)
}

/** POSIX-style basename (safe in browser and Node). */
function pathBasename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

function isAbsolutePath(filePath: string): boolean {
  const trimmed = filePath.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('/')) return true
  return /^[A-Za-z]:[\\/]/.test(trimmed)
}

function joinPaths(root: string, relative: string): string {
  const base = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const rel = relative.replace(/\\/g, '/').replace(/^[/\\]+/, '')
  return rel ? `${base}/${rel}` : base
}

/** Build a file:// href without Node's pathToFileURL (renderer-safe). */
export function buildFilePreviewUrl(absPath: string): string | undefined {
  const trimmed = absPath.trim()
  if (!trimmed) return undefined
  const normalized = trimmed.replace(/\\/g, '/')
  if (/^[A-Za-z]:/.test(normalized)) {
    return `file:///${encodeURI(normalized)}`
  }
  if (normalized.startsWith('/')) {
    return `file://${encodeURI(normalized)}`
  }
  return `file:///${encodeURI(normalized)}`
}

function previewUrlForPath(absPath: string): string | undefined {
  return buildFilePreviewUrl(absPath)
}

function labelForPath(absPath: string, displayPath?: string): string {
  const fromDisplay = displayPath?.trim()
  if (fromDisplay) return pathBasename(fromDisplay) || fromDisplay
  return pathBasename(absPath) || absPath
}

function resolveToAbsolutePath(
  rawPath: string,
  sandboxRoot?: string,
): string | undefined {
  const trimmed = rawPath.trim()
  if (!trimmed) return undefined
  if (isAbsolutePath(trimmed)) return trimmed
  const root = sandboxRoot?.trim()
  if (!root) return trimmed
  const normalized = trimmed.replace(/\\/g, '/').replace(/^[/\\]+/, '')
  return joinPaths(root, normalized)
}

/** Resolve a file-change row to an absolute path (workspace wins over sandbox). */
export function resolveFileChangeAbsolutePath(
  preview: { path: string; workspacePath?: string },
  sandboxRoot?: string,
): string | undefined {
  const displayPath = preview.path.trim()
  if (!displayPath) return undefined
  if (isAbsolutePath(displayPath)) return displayPath
  const workspace = preview.workspacePath?.trim()
  if (workspace) return joinPaths(workspace, displayPath)
  return resolveToAbsolutePath(displayPath, sandboxRoot)
}

function pushAttachment(
  out: StepAttachment[],
  seen: Set<string>,
  candidate: Omit<StepAttachment, 'url'> & { url?: string },
): void {
  const path = candidate.path.trim()
  if (!path) return
  if (isCaptureArtifactPath(path)) return
  // Step attachment bubbles keep non-delete files only (sandbox + workspace creates/edits).
  if (candidate.action === 'delete') return
  const key = normalizePathKey(path)
  if (seen.has(key)) return
  seen.add(key)
  out.push({
    ...candidate,
    path,
    label: candidate.label.trim() || labelForPath(path),
    url: candidate.url ?? previewUrlForPath(path),
  })
}

function attachmentsFromFileChanges(
  toolName: string,
  root: Record<string, unknown>,
  sandboxRoot?: string,
): StepAttachment[] {
  const resolvedRoot =
    typeof root.sandboxRoot === 'string' ? root.sandboxRoot : sandboxRoot
  const previews = parseToolFileChanges(root)
  const out: StepAttachment[] = []
  const seen = new Set<string>()
  for (const preview of previews) {
    const abs = resolveFileChangeAbsolutePath(preview, resolvedRoot)
    if (!abs) continue
    pushAttachment(out, seen, {
      path: abs,
      label: labelForPath(abs, preview.path),
      displayPath: preview.path,
      toolName,
      action: preview.action,
      additions: preview.additions,
      deletions: preview.deletions,
      diff: preview.diff,
      moveFrom: preview.moveFrom,
    })
  }
  return out
}

function attachmentsFromWrittenPath(
  toolName: string,
  root: Record<string, unknown>,
  sandboxRoot?: string,
): StepAttachment[] {
  const rawPath = root.path
  if (typeof rawPath !== 'string' || !rawPath.trim()) return []
  const resolvedRoot =
    typeof root.sandboxRoot === 'string' ? root.sandboxRoot : sandboxRoot
  const abs = resolveToAbsolutePath(rawPath, resolvedRoot)
  if (!abs) return []
  const out: StepAttachment[] = []
  const seen = new Set<string>()
  const sizeBytes =
    typeof root.size === 'number' && Number.isFinite(root.size)
      ? root.size
      : undefined
  pushAttachment(out, seen, {
    path: abs,
    label: labelForPath(abs),
    toolName,
    sizeBytes,
    action:
      root.written === true && !root.deletions
        ? 'create'
        : root.written === true
          ? 'modify'
          : undefined,
  })
  return out
}

function attachmentsFromFilesArray(
  toolName: string,
  root: Record<string, unknown>,
  sandboxRoot?: string,
): StepAttachment[] {
  const filesField = root.files
  if (!Array.isArray(filesField)) return []
  const resolvedRoot =
    typeof root.sandboxRoot === 'string' ? root.sandboxRoot : sandboxRoot
  const out: StepAttachment[] = []
  const seen = new Set<string>()
  for (const entry of filesField) {
    const row = asRecord(entry)
    if (!row) continue
    const rawPath = row.path
    if (typeof rawPath !== 'string' || !rawPath.trim()) continue
    const action =
      row.action === 'create' ||
      row.action === 'modify' ||
      row.action === 'rename'
        ? row.action
        : row.action === 'delete'
          ? 'delete'
          : undefined
    const abs = resolveToAbsolutePath(rawPath, resolvedRoot)
    if (!abs) continue
    pushAttachment(out, seen, {
      path: abs,
      label: labelForPath(abs, rawPath),
      toolName,
      action,
    })
  }
  return out
}

function attachmentsFromRunScript(
  toolName: string,
  root: Record<string, unknown>,
  sandboxRoot?: string,
): StepAttachment[] {
  const resolvedRoot =
    typeof root.sandboxRoot === 'string' ? root.sandboxRoot : sandboxRoot
  const out: StepAttachment[] = []
  const seen = new Set<string>()

  const artifactsField = root.artifacts
  if (Array.isArray(artifactsField)) {
    for (const row of artifactsField) {
      const a = asRecord(row)
      if (!a) continue
      const role = a.role
      if (role === 'script' || role === 'capture') continue
      const rawPath = a.path
      if (typeof rawPath !== 'string' || !rawPath.trim()) continue
      const abs = resolveToAbsolutePath(rawPath, resolvedRoot) ?? rawPath.trim()
      if (isCaptureArtifactPath(abs)) continue
      const label =
        role === 'primary'
          ? `primary: ${labelForPath(abs, typeof a.relPath === 'string' ? a.relPath : undefined)}`
          : labelForPath(abs, typeof a.relPath === 'string' ? a.relPath : undefined)
      pushAttachment(out, seen, {
        path: abs,
        label,
        toolName,
        sizeBytes:
          typeof a.sizeBytes === 'number' && Number.isFinite(a.sizeBytes)
            ? a.sizeBytes
            : undefined,
      })
    }
    return out
  }

  const resultReadFrom = root.resultReadFrom
  if (typeof resultReadFrom === 'string' && resultReadFrom.trim()) {
    const abs = resolveToAbsolutePath(resultReadFrom, resolvedRoot)
    if (abs && !isCaptureArtifactPath(abs)) {
      pushAttachment(out, seen, {
        path: abs,
        label: labelForPath(abs, resultReadFrom),
        toolName,
      })
    }
  }

  return out
}

function attachmentsFromSuccessDeliverables(
  toolName: string,
  root: Record<string, unknown>,
  sandboxRoot?: string,
): StepAttachment[] {
  if (root.success !== true) return []

  const resolvedRoot =
    typeof root.sandboxRoot === 'string' ? root.sandboxRoot : sandboxRoot
  const out: StepAttachment[] = []
  const seen = new Set<string>()

  for (const field of ['pdf_path', 'file_path', 'output_path'] as const) {
    const raw = root[field]
    if (typeof raw !== 'string' || !raw.trim()) continue
    const displayPath = raw.trim()
    const abs = resolveToAbsolutePath(displayPath, resolvedRoot)
    if (!abs) continue
    pushAttachment(out, seen, {
      path: abs,
      label: labelForPath(abs, displayPath),
      displayPath: isAbsolutePath(displayPath) ? undefined : displayPath,
      toolName,
      action: 'create',
    })
  }

  return out
}

function isToolErrorResult(root: Record<string, unknown>): boolean {
  if (typeof root.error === 'string' && root.error.trim()) return true
  if (root.success === false) return true
  if (root.ok === false) return true
  if (root.written === false) return true
  return false
}

/**
 * Parse a tool execute result into step attachments (one per output file).
 */
export function extractAttachmentsFromToolResult(
  toolName: string,
  result: unknown,
  sandboxRoot?: string,
): StepAttachment[] {
  const root = asRecord(result)
  if (!root || isToolErrorResult(root)) return []

  const fromChanges = attachmentsFromFileChanges(toolName, root, sandboxRoot)

  if (toolName === 'run_script' || toolName === 'run_script_file') {
    if (root.success !== true) {
      return fromChanges.length > 0 ? dedupeStepAttachments(fromChanges) : []
    }
    return dedupeStepAttachments([
      ...fromChanges,
      ...attachmentsFromRunScript(toolName, root, sandboxRoot),
    ])
  }

  if (fromChanges.length > 0) {
    return dedupeStepAttachments(fromChanges)
  }

  const fromFiles = attachmentsFromFilesArray(toolName, root, sandboxRoot)
  if (fromFiles.length > 0) return dedupeStepAttachments(fromFiles)

  if (root.written === true) {
    return dedupeStepAttachments(
      attachmentsFromWrittenPath(toolName, root, sandboxRoot),
    )
  }

  if (root.success === true) {
    const fromDeliverables = attachmentsFromSuccessDeliverables(
      toolName,
      root,
      sandboxRoot,
    )
    if (fromDeliverables.length > 0) {
      return dedupeStepAttachments(fromDeliverables)
    }
  }

  return []
}

export function mergeStepAttachments(
  existing: readonly StepAttachment[],
  incoming: readonly StepAttachment[],
): StepAttachment[] {
  const merged = [...existing]
  const seen = new Set(existing.map((a) => attachmentDedupeKey(a)))
  for (const item of incoming) {
    const key = attachmentDedupeKey(item)
    if (!key) continue
    if (seen.has(key)) {
      const idx = merged.findIndex((a) => attachmentDedupeKey(a) === key)
      if (idx >= 0) {
        merged[idx] = { ...merged[idx]!, ...item, path: merged[idx]!.path }
      }
      continue
    }
    seen.add(key)
    merged.push(item)
  }
  return merged
}

export function formatStepAttachmentShortcutLabel(
  attachment: StepAttachment,
): string {
  const base =
    attachment.displayPath?.trim() ||
    attachment.label.trim() ||
    pathBasename(attachment.path)
  const add = attachment.additions ?? 0
  const del = attachment.deletions ?? 0
  if (add <= 0 && del <= 0) return base
  const stats: string[] = []
  if (add > 0) stats.push(`+${add}`)
  if (del > 0) stats.push(`−${del}`)
  return `${base} ${stats.join(' ')}`
}

export function stepAttachmentHasDiffStats(attachment: StepAttachment): boolean {
  return (attachment.additions ?? 0) > 0 || (attachment.deletions ?? 0) > 0
}

export function stepAttachmentHasDiffPreview(attachment: StepAttachment): boolean {
  return Boolean(attachment.diff?.trim())
}

/** Convert attachments that carry unified diffs into file-change preview cards. */
export function stepAttachmentsToFileChangePreviews(
  attachments: readonly StepAttachment[],
): FileChangePreview[] {
  const out: FileChangePreview[] = []
  for (const attachment of dedupeStepAttachments(attachments)) {
    const diff = attachment.diff?.trim()
    if (!diff) continue
    const path =
      attachment.displayPath?.trim() ||
      attachment.label.trim() ||
      attachment.path.trim()
    if (!path) continue
    out.push({
      path,
      diff,
      additions: attachment.additions ?? 0,
      deletions: attachment.deletions ?? 0,
      action: attachment.action,
      moveFrom: attachment.moveFrom,
    })
  }
  return out
}

/** Resolve a file-change preview to a file:// URL for the chat report panel. */
export function fileChangePreviewOpenUrl(
  preview: { path: string; workspacePath?: string; action?: FileChangeAction },
  fallbackWorkspacePath?: string | null,
): string | undefined {
  if (preview.action === 'delete') return undefined
  const workspace =
    preview.workspacePath?.trim() || fallbackWorkspacePath?.trim() || undefined
  const abs = resolveFileChangeAbsolutePath({
    path: preview.path,
    workspacePath: workspace,
  })
  if (!abs || !isAbsolutePath(abs)) return undefined
  return buildFilePreviewUrl(abs)
}

/**
 * Prefer diffs stored on attachments; otherwise match tool-result file changes
 * by display/absolute path so older turns without persisted diff still preview.
 * If matching fails but the section looks like file changes, return all tool diffs.
 */
export function resolveFileChangePreviewsForAttachments(
  attachments: readonly StepAttachment[],
  toolFileChanges: readonly FileChangePreview[],
): FileChangePreview[] {
  const direct = stepAttachmentsToFileChangePreviews(attachments)
  if (direct.length > 0) return direct
  if (attachments.length === 0) return []
  if (toolFileChanges.length === 0) return []

  const byKey = new Map<string, FileChangePreview>()
  for (const file of toolFileChanges) {
    const key = normalizePathKey(file.path)
    if (key) byKey.set(key, file)
  }

  const out: FileChangePreview[] = []
  const seen = new Set<string>()
  for (const attachment of dedupeStepAttachments(attachments)) {
    const candidates = [
      attachment.displayPath,
      attachment.path,
      attachment.label,
    ]
      .map((value) => value?.trim() ?? '')
      .filter(Boolean)

    let match: FileChangePreview | undefined
    for (const candidate of candidates) {
      match = byKey.get(normalizePathKey(candidate))
      if (match) break
      const base = pathBasename(candidate).toLowerCase()
      if (!base) continue
      for (const [key, file] of byKey) {
        if (pathBasename(key) === base) {
          match = file
          break
        }
      }
      if (match) break
    }
    if (!match) continue
    const key = normalizePathKey(match.path)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(match)
  }
  if (out.length > 0) return out

  // Matching failed (path shape drift) — still show peeks when this section is
  // clearly a file-change list and the message has tool diffs available.
  const looksLikeFileChanges = attachments.some(
    (item) =>
      stepAttachmentHasDiffStats(item) ||
      item.action === 'create' ||
      item.action === 'modify' ||
      item.action === 'delete' ||
      item.action === 'rename' ||
      Boolean(item.toolName && isFileChangeToolName(item.toolName)) ||
      Boolean(item.diff?.trim()),
  )
  return looksLikeFileChanges ? [...toolFileChanges] : []
}

export function stepAttachmentsToOutputLinks(
  attachments: readonly StepAttachment[],
): StepOutputLink[] {
  const links: StepOutputLink[] = []
  for (const attachment of dedupeStepAttachments(attachments)) {
    const url = attachment.url ?? previewUrlForPath(attachment.path)
    if (!url) continue
    links.push({
      label: formatStepAttachmentShortcutLabel(attachment),
      url,
    })
  }
  return dedupeOutputLinks(links)
}

/** Build attachments from legacy persisted output link rows. */
export function attachmentsFromOutputLinks(
  links: readonly StepOutputLink[],
): StepAttachment[] {
  const out: StepAttachment[] = []
  for (const link of links) {
    const url = link.url?.trim()
    if (!url) continue
    out.push({
      path: url,
      label: link.label?.trim() || pathBasename(url) || url,
      url,
    })
  }
  return dedupeStepAttachments(out)
}

export function pdfPreviewUrlFromAttachments(
  attachments: readonly StepAttachment[],
): string | undefined {
  for (const link of stepAttachmentsToOutputLinks(attachments)) {
    const url = link.url.trim()
    if (
      url.toLowerCase().includes('.pdf') ||
      link.label.toLowerCase().endsWith('.pdf')
    ) {
      return url
    }
  }
  return undefined
}

export function stepHasPdfAttachment(
  attachments: readonly StepAttachment[],
): boolean {
  return Boolean(pdfPreviewUrlFromAttachments(attachments))
}
