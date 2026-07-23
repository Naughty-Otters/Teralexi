/**
 * Cursor-like summary helpers for Exploring / Explore accordion headers.
 */

function inputRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return input as Record<string, unknown>
}

function pickPath(record: Record<string, unknown> | null): string {
  if (!record) return ''
  for (const key of [
    'path',
    'file_path',
    'target_file',
    'scriptRelativePath',
    'from',
    'to',
  ]) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** Paths touched by a single tool invocation (input paths preferred). */
export function pathsFromToolInvocation(
  toolName: string,
  input: unknown,
): string[] {
  const record = inputRecord(input)
  const path = pickPath(record)
  if (path) return [path]
  void toolName
  return []
}

export type ExploreActivityCounts = {
  toolCount: number
  fileCount: number
}

export function countExploreActivity(
  items: ReadonlyArray<{ toolName: string; input?: unknown }>,
): ExploreActivityCounts {
  const files = new Set<string>()
  for (const item of items) {
    for (const path of pathsFromToolInvocation(item.toolName, item.input)) {
      files.add(path.replace(/\\/g, '/'))
    }
  }
  return {
    toolCount: items.length,
    fileCount: files.size,
  }
}

/** Header status while running or after completion (Cursor-like). */
export function formatExploreActivityStatus(args: {
  live: boolean
  toolCount: number
  fileCount: number
}): string {
  const { live, toolCount, fileCount } = args
  if (live) {
    if (toolCount <= 0) return 'Looking around…'
    if (fileCount > 0) return `Exploring ${fileCount} file${fileCount === 1 ? '' : 's'}…`
    return `${toolCount} tool${toolCount === 1 ? '' : 's'} in progress`
  }
  if (fileCount > 0) {
    return `Explored ${fileCount} file${fileCount === 1 ? '' : 's'}`
  }
  if (toolCount > 0) {
    return `${toolCount} tool${toolCount === 1 ? '' : 's'}`
  }
  return 'Done'
}

/**
 * Map shell commands that look like search tools to Cursor-like row labels.
 * Returns null when the command should keep the generic Shell label.
 */
export function shellExploreRowLabel(command: unknown): {
  kind: 'Grep' | 'Glob' | 'Shell'
  detail: string
} | null {
  const text = Array.isArray(command)
    ? command.map(String).join(' ')
    : typeof command === 'string'
      ? command
      : ''
  const trimmed = text.trim()
  if (!trimmed) return null

  const rg =
    /\b(?:rg|ripgrep|git\s+grep|grep)\b/i.exec(trimmed) ||
    /^\s*(?:rg|grep)\b/i.test(trimmed)
  if (rg) {
    const pattern =
      /(?:rg|ripgrep|grep)\s+(?:-[^\s]+\s+)*['"]?([^'"\s]+)/i.exec(trimmed)?.[1] ??
      ''
    return {
      kind: 'Grep',
      detail: pattern ? `pattern ${pattern}` : trimmed.slice(0, 80),
    }
  }

  if (/\bfind\b/i.test(trimmed) || /\bglob\b/i.test(trimmed)) {
    return {
      kind: 'Glob',
      detail: trimmed.slice(0, 96),
    }
  }

  return { kind: 'Shell', detail: trimmed.slice(0, 96) }
}
