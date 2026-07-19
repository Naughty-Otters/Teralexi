import type { FileChangeAction, FileChangePreview } from './types'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function basenameOnly(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

function displayPath(rawPath: unknown, sandboxRoot?: unknown, workspacePath?: unknown): string {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return 'unknown'
  const normalized = rawPath.replace(/\\/g, '/')
  // Workspace root takes priority — it is the more specific, user-visible root.
  if (typeof workspacePath === 'string' && workspacePath.trim()) {
    const ws = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '')
    if (normalized.startsWith(`${ws}/`)) {
      return normalized.slice(ws.length + 1)
    }
  }
  if (typeof sandboxRoot === 'string' && sandboxRoot.trim()) {
    const root = sandboxRoot.replace(/\\/g, '/').replace(/\/+$/, '')
    if (normalized.startsWith(`${root}/`)) {
      return normalized.slice(root.length + 1)
    }
  }
  // Already a relative path (e.g. produced by buildFileChangePreview) — return as-is.
  if (!normalized.startsWith('/') && !/^[A-Za-z]:/.test(normalized)) {
    return normalized
  }
  // Keep absolute path so the UI can strip against the active workspace later.
  return normalized
}

function parseFileChangeEntry(
  value: unknown,
  sandboxRoot?: unknown,
  workspacePath?: unknown,
): FileChangePreview | null {
  const row = asRecord(value)
  if (!row) return null
  const diff = typeof row.diff === 'string' ? row.diff : ''
  if (!diff.trim()) return null
  return {
    path: displayPath(row.path, sandboxRoot, workspacePath),
    diff,
    additions: typeof row.additions === 'number' ? row.additions : 0,
    deletions: typeof row.deletions === 'number' ? row.deletions : 0,
    action: parseAction(row.action),
    moveFrom:
      typeof row.moveFrom === 'string'
        ? displayPath(row.moveFrom, sandboxRoot, workspacePath)
        : undefined,
    workspacePath:
      typeof row.workspacePath === 'string' && row.workspacePath.trim()
        ? row.workspacePath
        : typeof workspacePath === 'string' && workspacePath.trim()
          ? workspacePath
          : undefined,
  }
}

function parseAction(value: unknown): FileChangeAction | undefined {
  if (value === 'create' || value === 'modify' || value === 'delete' || value === 'rename') {
    return value
  }
  if (value === 'A') return 'create'
  if (value === 'M') return 'modify'
  if (value === 'D') return 'delete'
  return undefined
}

/** Split concatenated unified diffs (jsdiff `Index:` headers). */
export function splitUnifiedDiff(combined: string): string[] {
  const text = combined.trim()
  if (!text) return []

  const chunks: string[] = []
  let current: string[] = []

  for (const line of text.split('\n')) {
    if (
      (line.startsWith('Index: ') || line.startsWith('diff --git ')) &&
      current.length > 0
    ) {
      chunks.push(current.join('\n'))
      current = []
    }
    current.push(line)
  }

  if (current.length > 0) {
    chunks.push(current.join('\n'))
  }

  return chunks.filter((chunk) => chunk.trim().length > 0)
}

/**
 * Ensure execute/preview payloads include a `files[]` array the UI parser can
 * consume (legacy flat `diff` + `path` fields are lifted into one row).
 */
export function ensureFileChangeFilesInOutput(
  output: Record<string, unknown>,
): Record<string, unknown> {
  const existing = output.files
  if (Array.isArray(existing) && existing.length > 0) {
    const hasRenderable = existing.some((entry) => {
      const row = asRecord(entry)
      return row && typeof row.diff === 'string' && row.diff.trim().length > 0
    })
    if (hasRenderable) return output
  }

  const parsed = parseToolFileChanges(output)
  if (parsed.length === 0) return output
  return { ...output, files: parsed }
}

/**
 * Normalize tool output (execute result or preview IPC) into file change rows.
 */
export function parseToolFileChanges(output: unknown): FileChangePreview[] {
  const root = asRecord(output)
  if (!root) return []

  const sandboxRoot = root.sandboxRoot
  const workspacePath = root.workspacePath

  const filesField = root.files
  if (Array.isArray(filesField)) {
    return filesField
      .map((entry) => parseFileChangeEntry(entry, sandboxRoot, workspacePath))
      .filter((entry): entry is FileChangePreview => entry !== null)
  }

  const diff = typeof root.diff === 'string' ? root.diff : ''
  if (!diff.trim()) return []

  const additions = typeof root.additions === 'number' ? root.additions : 0
  const deletions = typeof root.deletions === 'number' ? root.deletions : 0
  const filePath = displayPath(root.path, sandboxRoot, workspacePath)

  const split = splitUnifiedDiff(diff)
  if (split.length <= 1) {
    return [
      {
        path: filePath,
        diff,
        additions,
        deletions,
        action: inferActionFromOutput(root),
      },
    ]
  }

  const perFileAdd = Math.floor(additions / split.length)
  const perFileDel = Math.floor(deletions / split.length)
  return split.map((chunk, index) => ({
    path: extractPathFromDiff(chunk) ?? `${filePath}#${index + 1}`,
    diff: chunk,
    additions: index === 0 ? additions - perFileAdd * (split.length - 1) : perFileAdd,
    deletions: index === 0 ? deletions - perFileDel * (split.length - 1) : perFileDel,
  }))
}

function inferActionFromOutput(root: Record<string, unknown>): FileChangeAction | undefined {
  if (typeof root.written === 'boolean' && root.written) {
    return root.additions && !root.deletions ? 'create' : 'modify'
  }
  return undefined
}

/** Collect file paths from unified patch text (Index:/+++ headers). */
export function extractPathsFromPatchText(patchText: string): string[] {
  const text = patchText.trim()
  if (!text) return []

  const paths = new Set<string>()
  const chunks = splitUnifiedDiff(text)
  if (chunks.length > 0) {
    for (const chunk of chunks) {
      const path = extractPathFromDiff(chunk)
      if (path) paths.add(path)
    }
    return [...paths]
  }

  const single = extractPathFromDiff(text)
  return single ? [single] : []
}

function extractPathFromDiff(diff: string): string | null {
  for (const line of diff.split('\n')) {
    if (line.startsWith('Index: ')) {
      return line.slice('Index: '.length).trim()
    }
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).trim()
      if (path !== '/dev/null') {
        return basenameOnly(path)
      }
    }
  }
  return null
}
