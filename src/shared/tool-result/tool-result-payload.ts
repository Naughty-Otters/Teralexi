import { stripTerminalCaptureHeaders } from './terminal-capture'

const EMPTY_CAPTURE_MARKERS = new Set([
  '(no stdout/stderr)',
  '(no output)',
])

/** Read-only / listing tools — primary payload is structured data, not a shell transcript. */
export const QUERY_TOOL_NAMES = new Set([
  'read_file',
  'list_files',
  'grep_files',
  'glob_files',
  'search_files',
  'file_status',
  'storage_check',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function isMeaningfulText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (EMPTY_CAPTURE_MARKERS.has(trimmed.toLowerCase())) return false
  return true
}

function joinConsoleSegments(record: Record<string, unknown>): string {
  const parts: string[] = []
  if (typeof record.stdout === 'string' && record.stdout.trim()) {
    parts.push(record.stdout.trim())
  }
  if (typeof record.stderr === 'string' && record.stderr.trim()) {
    parts.push(record.stderr.trim())
  }
  return parts.join('\n\n')
}

function formatPathsList(paths: unknown): string | null {
  if (!Array.isArray(paths) || paths.length === 0) return null
  const lines = paths
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
  if (lines.length === 0) return null
  return lines.map((p) => `- \`${p}\``).join('\n')
}

function formatEntriesList(entries: unknown): string | null {
  if (!Array.isArray(entries) || entries.length === 0) return null
  const lines: string[] = []
  for (const entry of entries) {
    if (typeof entry === 'string') {
      lines.push(`- ${entry}`)
      continue
    }
    const row = asRecord(entry)
    if (!row) continue
    const name = typeof row.name === 'string' ? row.name : ''
    const type = typeof row.type === 'string' ? row.type : ''
    const relPath = typeof row.path === 'string' ? row.path : name
    if (relPath) lines.push(`- \`${relPath}\`${type ? ` (${type})` : ''}`)
  }
  if (lines.length === 0) return null
  return lines.join('\n')
}

function formatSearchResults(results: unknown): string | null {
  if (!Array.isArray(results) || results.length === 0) return null
  const lines: string[] = []
  for (const row of results) {
    const r = asRecord(row)
    if (!r) continue
    const p = typeof r.path === 'string' ? r.path : ''
    const match = typeof r.match === 'string' ? r.match : ''
    if (p) lines.push(`- \`${p}\`${match ? ` · ${match}` : ''}`)
  }
  if (lines.length === 0) return null
  return lines.join('\n')
}

function formatDataField(data: unknown): string | null {
  if (data === undefined || data === null) return null
  if (typeof data === 'string') return data.trim() || null
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

function isCommandToolName(name: string): boolean {
  const n = name.toLowerCase()
  return (
    n.startsWith('github_') ||
    n.startsWith('git_') ||
    n === 'shell' ||
    n === 'run_script' ||
    n === 'run_script_file' ||
    n.includes('command')
  )
}

/**
 * Primary human-readable payload for display (capture / tool output files first).
 * Returns null when file-change display should take over.
 */
export function deriveToolResultContent(
  toolName: string,
  record: Record<string, unknown>,
): string | null {
  const n = toolName.toLowerCase()

  if (typeof record.resultContent === 'string') {
    const stripped = stripTerminalCaptureHeaders(record.resultContent)
    if (isMeaningfulText(stripped)) return stripped
  }

  if (typeof record.output === 'string') {
    const stripped = stripTerminalCaptureHeaders(record.output)
    if (isMeaningfulText(stripped)) return stripped
  }

  if (typeof record.content === 'string' && record.content.trim()) {
    return record.content
  }

  if (typeof record.matches === 'string') {
    return record.matches.trim() || '(no matches)'
  }

  const pathsBlock = formatPathsList(record.paths)
  if (pathsBlock) return pathsBlock

  const entriesBlock = formatEntriesList(record.entries)
  if (entriesBlock) return entriesBlock

  const resultsBlock = formatSearchResults(record.results)
  if (resultsBlock) return resultsBlock

  const dataBlock = formatDataField(record.data)
  if (dataBlock) return dataBlock

  if (typeof record.summary === 'string' && record.summary.trim()) {
    return record.summary.trim()
  }

  if (typeof record.message === 'string' && record.message.trim()) {
    const hasConsole = joinConsoleSegments(record).length > 0
    if (!hasConsole || QUERY_TOOL_NAMES.has(n)) {
      return record.message.trim()
    }
  }

  const consoleText = joinConsoleSegments(record)
  if (consoleText && isCommandToolName(n)) {
    return consoleText
  }

  return null
}

/** Stamp `resultContent` on object results when tools omit it. */
export function enrichToolResultRecord(
  toolName: string,
  record: Record<string, unknown>,
): Record<string, unknown> {
  const content = deriveToolResultContent(toolName, record)
  if (content && typeof record.resultContent !== 'string') {
    return { ...record, resultContent: content }
  }
  return record
}
