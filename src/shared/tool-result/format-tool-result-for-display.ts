import { parseToolFileChanges } from '@shared/file-change/parse-tool-file-changes'
import { inferToolResultType } from './infer-tool-result-type'
import {
  stripTerminalCaptureHeaders,
} from './terminal-capture'
import { deriveToolResultContent } from './tool-result-payload'
import { summarizeToolInput } from './summarize-tool-input'
import type { ToolResultType } from './types'

export type FormatToolResultOpts = {
  toolName?: string
  toolInput?: unknown
}

export { stripTerminalCaptureHeaders } from './terminal-capture'

const DISPLAY_JSON_MAX = 8_000
const QUERY_BODY_MAX = 100

const EMPTY_CAPTURE_MARKERS = new Set([
  '(no stdout/stderr)',
  '(no output)',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function isMeaningfulCaptureText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (EMPTY_CAPTURE_MARKERS.has(trimmed.toLowerCase())) return false
  return true
}

function displayPathFromRecord(record: Record<string, unknown>): string {
  const raw = record.path
  if (typeof raw !== 'string' || !raw.trim()) return 'unknown'
  const normalized = raw.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

/**
 * Tool run produced or changed files on disk — prefer this over console text.
 */
function formatImpactedOutputsBlock(record: Record<string, unknown>): string | null {
  const fileChanges = parseToolFileChanges(record)
  if (fileChanges.length > 0) {
    return formatFileChangeBlock(record)
  }

  if (record.written === true) {
    const path = displayPathFromRecord(record)
    if (path !== 'unknown') {
      return `**Output file**\n\n- \`${path}\` written`
    }
  }

  if (record.applied === true) {
    const path = displayPathFromRecord(record)
    if (path !== 'unknown') {
      return `**Patch applied**\n\n- \`${path}\``
    }
    return '**Patch applied**'
  }

  if (record.deleted === true) {
    const path = displayPathFromRecord(record)
    if (path !== 'unknown') {
      return `**Deleted**\n\n- \`${path}\``
    }
    return '**Deleted**'
  }

  if (record.moved === true) {
    const from =
      typeof record.from === 'string' && record.from.trim()
        ? record.from.trim()
        : null
    const to =
      typeof record.to === 'string' && record.to.trim() ? record.to.trim() : null
    if (from && to) {
      return `**Moved**\n\n- \`${from}\` → \`${to}\``
    }
    return '**Moved**'
  }

  if (record.copied === true) {
    const from =
      typeof record.from === 'string' && record.from.trim()
        ? record.from.trim()
        : null
    const to =
      typeof record.to === 'string' && record.to.trim() ? record.to.trim() : null
    if (from && to) {
      return `**Copied**\n\n- \`${from}\` → \`${to}\``
    }
    return '**Copied**'
  }

  const filesField = record.files
  if (Array.isArray(filesField) && filesField.length > 0) {
    const lines: string[] = []
    for (const entry of filesField) {
      const row = asRecord(entry)
      if (!row) continue
      const path =
        typeof row.path === 'string' && row.path.trim()
          ? row.path.trim()
          : null
      if (path) lines.push(`- \`${path}\``)
    }
    if (lines.length > 0) {
      return `**Output files**\n\n${lines.join('\n')}`
    }
  }

  return formatScriptArtifactsBlock(record)
}

function artifactDisplayPath(row: Record<string, unknown>): string | null {
  const rel =
    typeof row.relPath === 'string' && row.relPath.trim()
      ? row.relPath.trim()
      : null
  if (rel) return rel
  const abs =
    typeof row.path === 'string' && row.path.trim() ? row.path.trim() : null
  if (!abs) return null
  const normalized = abs.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

/** Deliverables from run_script / run_script_file (not capture or script source). */
function formatScriptArtifactsBlock(record: Record<string, unknown>): string | null {
  const artifactsField = record.artifacts
  if (!Array.isArray(artifactsField) || artifactsField.length === 0) return null

  const deliverables: Array<{ role: string; path: string }> = []
  for (const entry of artifactsField) {
    const row = asRecord(entry)
    if (!row) continue
    const role = typeof row.role === 'string' ? row.role : ''
    if (role === 'script' || role === 'capture') continue
    const path = artifactDisplayPath(row)
    if (!path) continue
    deliverables.push({ role, path })
  }

  if (deliverables.length === 0) return null

  const primary = deliverables.find((d) => d.role === 'primary')
  const sidecars = deliverables.filter((d) => d.role !== 'primary')

  const lines: string[] = []
  if (primary) {
    lines.push(`- **Primary**: \`${primary.path}\``)
  }
  for (const row of sidecars) {
    lines.push(`- \`${row.path}\``)
  }

  const preview =
    typeof record.resultContent === 'string' && record.resultContent.trim()
      ? stripTerminalCaptureHeaders(record.resultContent).trim()
      : ''
  const header = primary ? '**Script deliverable**' : '**Script output files**'
  if (!preview) {
    return `${header}\n\n${lines.join('\n')}`
  }
  const fenced = preview.includes('\n') ? `\`\`\`text\n${preview}\n\`\`\`` : preview
  return `${header}\n\n${lines.join('\n')}\n\n${fenced}`
}

/** Text read from capture / result files (not live console fields). */
function extractCaptureTextFromResult(record: Record<string, unknown>): string {
  if (typeof record.resultContent === 'string') {
    const stripped = stripTerminalCaptureHeaders(record.resultContent)
    if (isMeaningfulCaptureText(stripped)) return stripped
  }
  if (typeof record.output === 'string') {
    const stripped = stripTerminalCaptureHeaders(record.output)
    if (isMeaningfulCaptureText(stripped)) return stripped
  }
  return ''
}

/** Live stdout/stderr from the process (console). */
function extractConsoleTextFromResult(record: Record<string, unknown>): string {
  const segments: string[] = []
  if (typeof record.stdout === 'string' && record.stdout.trim()) {
    segments.push(record.stdout.trim())
  }
  if (typeof record.stderr === 'string' && record.stderr.trim()) {
    segments.push(record.stderr.trim())
  }
  return segments.join('\n\n')
}

/**
 * Terminal-style text for display: capture file content first, then console.
 */
export function extractTerminalTextFromResult(
  record: Record<string, unknown>,
): string {
  const capture = extractCaptureTextFromResult(record)
  if (capture) return capture

  const consoleText = extractConsoleTextFromResult(record)
  if (consoleText) return consoleText

  if (typeof record.resultContent === 'string') {
    return stripTerminalCaptureHeaders(record.resultContent)
  }
  if (typeof record.output === 'string') {
    return stripTerminalCaptureHeaders(record.output)
  }
  return ''
}

function formatTerminalBlock(record: Record<string, unknown>): string {
  const text = extractTerminalTextFromResult(record)
  const exitCode =
    typeof record.exitCode === 'number'
      ? record.exitCode
      : record.success === false
        ? 1
        : record.success === true
          ? 0
          : undefined
  const header =
    exitCode !== undefined
      ? `**Terminal** (exit ${exitCode})`
      : '**Terminal**'
  if (!text) {
    if (typeof record.error === 'string' && record.error.trim()) {
      return `${header}\n\n${record.error.trim()}`
    }
    return `${header}\n\n_(no output)_`
  }
  return `${header}\n\n\`\`\`text\n${text}\n\`\`\``
}

function formatFileChangeBlock(record: Record<string, unknown>): string {
  const files = parseToolFileChanges(record)
  if (files.length === 0) {
    if (typeof record.error === 'string' && record.error.trim()) {
      return `**File change failed**\n\n${record.error.trim()}`
    }
    return '**File change** _(no diff preview)_'
  }
  const lines = files.map((f) => {
    const counts =
      f.additions > 0 || f.deletions > 0
        ? ` (+${f.additions} −${f.deletions})`
        : ''
    const action = f.action ? ` · ${f.action}` : ''
    const from =
      f.moveFrom && f.action === 'rename' ? ` ← ${f.moveFrom}` : ''
    return `- \`${f.path}\`${from}${counts}${action}`
  })
  return `**File changes**\n\n${lines.join('\n')}`
}

function formatTodoBlock(record: Record<string, unknown>): string {
  const todos = record.todos
  if (!Array.isArray(todos) || todos.length === 0) {
    return '**Todos** _(empty)_'
  }
  const lines: string[] = []
  for (const row of todos) {
    const t = asRecord(row)
    if (!t) continue
    const status = typeof t.status === 'string' ? t.status : 'pending'
    const content =
      typeof t.content === 'string'
        ? t.content
        : typeof t.title === 'string'
          ? t.title
          : '(todo)'
    const mark =
      status === 'completed' || status === 'done'
        ? 'x'
        : status === 'cancelled'
          ? '~'
          : ' '
    lines.push(`- [${mark}] ${content}`)
  }
  return `**Todos**\n\n${lines.join('\n')}`
}

function truncateQueryBody(body: string): string {
  if (body.length <= QUERY_BODY_MAX) return body
  const omitted = body.length - QUERY_BODY_MAX
  return `${body.slice(0, QUERY_BODY_MAX)}…[truncated ${omitted} chars]`
}

function formatQueryHeader(toolName: string, toolInput?: unknown): string {
  const label = toolName ? toolName.replace(/_/g, ' ') : 'result'
  const params = summarizeToolInput(toolInput, 120)
  return params ? `**${label}** · ${params}` : `**${label}**`
}

function formatQueryBlock(
  record: Record<string, unknown>,
  toolName: string,
  toolInput?: unknown,
): string {
  const body =
    deriveToolResultContent(toolName, record) ||
    (typeof record.resultContent === 'string' ? record.resultContent.trim() : '')
  const header = formatQueryHeader(toolName, toolInput)
  if (!body) {
    if (typeof record.error === 'string' && record.error.trim()) {
      return `${header}\n\n${record.error.trim()}`
    }
    return `${header} _(empty)_`
  }
  const preview = truncateQueryBody(body)
  const fenced = preview.includes('\n')
    ? `\`\`\`text\n${preview}\n\`\`\``
    : preview
  return `${header}\n\n${fenced}`
}

function formatPreflightBlock(record: Record<string, unknown>): string {
  const issues = record.issues
  if (!Array.isArray(issues) || issues.length === 0) {
    return '**Preflight failed**\n\nScript was not executed.'
  }
  const lines: string[] = []
  for (const row of issues) {
    const issue = asRecord(row)
    if (!issue) continue
    const code = typeof issue.code === 'string' ? issue.code : 'issue'
    const message =
      typeof issue.message === 'string' ? issue.message : String(issue.message ?? '')
    lines.push(`- **${code}**: ${message}`)
  }
  return `**Preflight failed** (script not executed)\n\n${lines.join('\n')}`
}

function formatErrorBlock(record: Record<string, unknown>): string {
  if (record.phase === 'preflight') {
    return formatPreflightBlock(record)
  }
  const msg =
    (typeof record.error === 'string' && record.error.trim()) ||
    (typeof record.message === 'string' && record.message.trim()) ||
    'Unknown error'
  return `**Error**\n\n${msg}`
}

function formatRawJson(record: Record<string, unknown>): string {
  try {
    const s = JSON.stringify(record, null, 2)
    if (s.length <= DISPLAY_JSON_MAX) return s
    return `${s.slice(0, DISPLAY_JSON_MAX)}\n…[truncated]`
  } catch {
    return String(record)
  }
}

/**
 * Human-readable tool output for agent step progress, transcripts, and digests.
 * Prefer this over raw JSON when presenting results to users.
 */
export function formatToolResultForDisplay(
  value: unknown,
  opts?: FormatToolResultOpts,
): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value

  const record = asRecord(value)
  if (!record) {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  const impacted = formatImpactedOutputsBlock(record)
  if (impacted) return impacted

  const toolName = opts?.toolName?.trim() ?? ''
  const resultType: ToolResultType =
    typeof record.resultType === 'string'
      ? (record.resultType as ToolResultType)
      : inferToolResultType(toolName, record)

  switch (resultType) {
    case 'terminal':
      return formatTerminalBlock(record)
    case 'file_change':
      return formatFileChangeBlock(record)
    case 'todo':
      return formatTodoBlock(record)
    case 'query':
      return formatQueryBlock(record, toolName, opts?.toolInput)
    case 'error':
      return formatErrorBlock(record)
    default:
      return formatRawJson(record)
  }
}
