import { parseToolFileChanges } from '@shared/file-change/parse-tool-file-changes'
import { normalizeTodos } from '@shared/agent/todos'
import { extractTerminalTextFromResult } from './format-tool-result-for-display'
import { inferToolResultType } from './infer-tool-result-type'

export type ExploringField = {
  label: string
  value: string
}

export type ExploringResult = {
  headline?: string
  fields?: ExploringField[]
  bullets?: string[]
  note?: string
}

const DETAIL_LABELS: Record<string, string> = {
  path: 'Location',
  file_path: 'File',
  target_file: 'File',
  scriptRelativePath: 'Script',
  from: 'From',
  to: 'To',
  query: 'Search for',
  pattern: 'Pattern',
  url: 'Link',
  command: 'Command',
  message: 'Message',
  branch: 'Branch',
  name: 'Name',
  recursive: 'Include subfolders',
  maxDepth: 'Depth',
  limit: 'Limit',
  offset: 'Start at line',
}

function inputRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return input as Record<string, unknown>
}

function outputRecord(output: unknown): Record<string, unknown> | null {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null
  return output as Record<string, unknown>
}

function formatDetailValue(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    if (key === 'command') return value.map(String).join(' ')
    return value.map(String).join(', ')
  }
  return ''
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

function truncateText(text: string, max = 480): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

function flattenListedEntries(
  entries: unknown[],
  limit = 12,
): Array<{ name: string; type: string }> {
  const out: Array<{ name: string; type: string }> = []

  function walk(items: unknown[]) {
    for (const item of items) {
      if (out.length >= limit) return
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const name = typeof row.name === 'string' ? row.name.trim() : ''
      if (!name) continue
      const type = typeof row.type === 'string' ? row.type : 'file'
      out.push({ name, type })
      const children = row.children
      if (Array.isArray(children) && children.length > 0) {
        walk(children)
      }
    }
  }

  walk(entries)
  return out
}

function fileChangeSummary(path: string, additions: number, deletions: number): string {
  const parts: string[] = []
  if (additions > 0) parts.push(`${additions} added`)
  if (deletions > 0) parts.push(`${deletions} removed`)
  const suffix = parts.length > 0 ? ` · ${parts.join(', ')}` : ''
  return `${path}${suffix}`
}

function friendlyFileAction(action?: string): string {
  switch (action) {
    case 'create':
      return 'Created'
    case 'delete':
      return 'Deleted'
    case 'rename':
      return 'Renamed'
    case 'modify':
      return 'Updated'
    default:
      return 'Changed'
  }
}

/** Labeled input fields for the exploring panel (no key=value strings). */
export function formatToolExploringDetails(
  toolName: string,
  input?: unknown,
): ExploringField[] {
  const record = inputRecord(input)
  if (!record) return []

  const name = toolName.trim().toLowerCase()
  const fields: ExploringField[] = []
  const seen = new Set<string>()

  const add = (key: string, label?: string) => {
    if (seen.has(key)) return
    const value = formatDetailValue(key, record[key])
    if (!value) return
    seen.add(key)
    fields.push({
      label: label ?? DETAIL_LABELS[key] ?? key.replace(/_/g, ' '),
      value,
    })
  }

  switch (name) {
    case 'list_files':
      add('path', 'Folder')
      add('recursive')
      add('maxDepth')
      break
    case 'search_files':
      add('path', 'Folder')
      add('query')
      break
    case 'glob_files':
      add('pattern')
      add('path', 'Folder')
      break
    case 'grep_files':
      add('pattern')
      add('path', 'Folder')
      break
    case 'read_file':
    case 'write_file':
    case 'edit_file':
    case 'edit_files':
    case 'apply_patch':
    case 'delete_file':
      add('path', 'File')
      if (toolName === 'edit_files') add('mode')
      break
    case 'move_file':
    case 'copy_file':
      add('from')
      add('to')
      break
    case 'web_search':
      add('query')
      break
    case 'web_scrape':
    case 'deep_research':
      add('url', 'Link')
      add('query')
      break
    case 'shell':
      add('command')
      break
    case 'run_script_file':
      add('scriptRelativePath', 'Script')
      break
  }

  if (fields.length > 0) return fields.slice(0, 4)

  for (const [key, value] of Object.entries(record)) {
    if (fields.length >= 4) break
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'object') continue
    add(key)
  }

  return fields
}

function formatTodoExploringResult(output: unknown): ExploringResult | null {
  const record = outputRecord(output)
  if (!record || !Array.isArray(record.todos)) return null
  const todos = normalizeTodos(record.todos as Array<Record<string, unknown>>)
  if (todos.length === 0) {
    return { headline: 'Task list is empty' }
  }
  return {
    headline: `${todos.length} task${todos.length === 1 ? '' : 's'}`,
    bullets: todos.map((todo) => {
      const status =
        todo.status === 'completed'
          ? 'Done'
          : todo.status === 'in_progress'
            ? 'In progress'
            : todo.status === 'cancelled'
              ? 'Cancelled'
              : 'Pending'
      return `${todo.content} (${status})`
    }),
  }
}

function formatFileExploringResult(output: unknown): ExploringResult | null {
  const record = outputRecord(output)
  if (!record) return null

  const files = parseToolFileChanges(record)
  if (files.length > 0) {
    return {
      headline: `${files.length} file${files.length === 1 ? '' : 's'} updated`,
      bullets: files.map((file) =>
        fileChangeSummary(
          file.path,
          file.additions,
          file.deletions,
        ).replace(/^/, `${friendlyFileAction(file.action)} `),
      ),
    }
  }

  if (record.written === true) {
    const path =
      typeof record.path === 'string' && record.path.trim()
        ? basename(record.path.trim())
        : 'file'
    return { headline: `Saved ${path}` }
  }
  if (record.applied === true) {
    const path =
      typeof record.path === 'string' && record.path.trim()
        ? basename(record.path.trim())
        : 'file'
    return { headline: `Applied changes to ${path}` }
  }
  if (record.deleted === true) {
    const path =
      typeof record.path === 'string' && record.path.trim()
        ? basename(record.path.trim())
        : 'file'
    return { headline: `Deleted ${path}` }
  }
  if (record.moved === true) {
    const from =
      typeof record.from === 'string' && record.from.trim()
        ? basename(record.from.trim())
        : 'file'
    const to =
      typeof record.to === 'string' && record.to.trim()
        ? basename(record.to.trim())
        : 'location'
    return { headline: `Moved ${from} to ${to}` }
  }

  return null
}

function formatListExploringResult(output: unknown): ExploringResult | null {
  const record = outputRecord(output)
  if (!record || !Array.isArray(record.entries)) return null
  const items = flattenListedEntries(record.entries)
  if (items.length === 0) {
    return { headline: 'Folder is empty' }
  }
  return {
    headline: `Found ${items.length} item${items.length === 1 ? '' : 's'}`,
    bullets: items.map((item) =>
      item.type === 'directory' ? `${item.name}/` : item.name,
    ),
  }
}

function formatReadFileExploringResult(output: unknown): ExploringResult | null {
  const record = outputRecord(output)
  if (!record) return null
  const content =
    typeof record.content === 'string'
      ? record.content
      : typeof record.text === 'string'
        ? record.text
        : ''
  if (!content.trim()) return null
  const lines = content.split('\n')
  const preview = lines.slice(0, 4).join('\n')
  const headline =
    lines.length > 1
      ? `Read ${lines.length} lines`
      : 'Read file contents'
  const note =
    lines.length > 4
      ? `${truncateText(preview, 320)}\n…`
      : truncateText(preview, 320)
  return { headline, note }
}

function formatTerminalExploringResult(
  toolName: string,
  output: unknown,
): ExploringResult | null {
  const record = outputRecord(output)
  if (!record) return null

  const text = extractTerminalTextFromResult(record).trim()
  const exitCode =
    typeof record.exitCode === 'number'
      ? record.exitCode
      : record.success === false
        ? 1
        : record.success === true
          ? 0
          : undefined

  const headline =
    exitCode === undefined
      ? 'Command finished'
      : exitCode === 0
        ? 'Command completed successfully'
        : `Command finished with code ${exitCode}`

  if (!text) {
    if (typeof record.error === 'string' && record.error.trim()) {
      return { headline, note: record.error.trim() }
    }
    return { headline: 'Command completed with no output' }
  }

  return {
    headline,
    note: truncateText(text, 520),
  }
}

function stripMarkdownToNote(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, ''),
    )
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/_\(([^)]+)\)_/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim()
}

function markdownToExploringResult(text: string): ExploringResult {
  const trimmed = text.trim()
  if (!trimmed) return {}

  const lines = trimmed.split('\n')
  const bullets: string[] = []
  const prose: string[] = []
  let headline = ''

  for (const line of lines) {
    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet?.[1]) {
      bullets.push(stripMarkdownToNote(bullet[1]))
      continue
    }
    const heading = line.match(/^\*\*([^*]+)\*\*/)
    if (heading?.[1] && !headline) {
      headline = heading[1].trim()
      continue
    }
    const cleaned = stripMarkdownToNote(line)
    if (cleaned) prose.push(cleaned)
  }

  if (bullets.length > 0) {
    return {
      headline: headline || undefined,
      bullets: bullets.slice(0, 8),
      note:
        prose.length > 0
          ? truncateText(prose.join('\n'), 520)
          : bullets.length > 8
            ? `…and ${bullets.length - 8} more`
            : undefined,
    }
  }

  return {
    headline: headline || undefined,
    note: truncateText(stripMarkdownToNote(trimmed), 520),
  }
}

/** Friendly structured result for the exploring panel. */
export function formatToolExploringResult(
  toolName: string,
  input: unknown,
  output: unknown,
  fallbackMarkdown?: string,
): ExploringResult | null {
  const name = toolName.trim().toLowerCase()
  const resultType = inferToolResultType(name, output)

  if (resultType === 'todo' || name === 'read_todos' || name === 'update_todos') {
    return formatTodoExploringResult(output)
  }

  if (resultType === 'file_change' || name.includes('file') || name.includes('patch')) {
    const fileResult = formatFileExploringResult(output)
    if (fileResult) return fileResult
  }

  if (name === 'list_files' || name === 'glob_files' || name === 'search_files') {
    const listResult = formatListExploringResult(output)
    if (listResult) return listResult
  }

  if (name === 'read_file') {
    const readResult = formatReadFileExploringResult(output)
    if (readResult) return readResult
  }

  if (
    resultType === 'terminal' ||
    name.startsWith('git_') ||
    name === 'shell' ||
    name === 'run_script' ||
    name === 'run_script_file'
  ) {
    const terminalResult = formatTerminalExploringResult(name, output)
    if (terminalResult) return terminalResult
  }

  if (typeof output === 'string' && output.trim()) {
    return { note: truncateText(output.trim(), 520) }
  }

  const record = outputRecord(output)
  if (record) {
    if (typeof record.error === 'string' && record.error.trim()) {
      return { headline: 'Something went wrong', note: record.error.trim() }
    }
    if (typeof record.message === 'string' && record.message.trim()) {
      return { headline: 'Done', note: record.message.trim() }
    }
  }

  if (fallbackMarkdown?.trim()) {
    const parsed = markdownToExploringResult(fallbackMarkdown)
    if (parsed.headline || parsed.bullets?.length || parsed.note) {
      return parsed
    }
  }

  return null
}

/** Single-line command label for terminal tools. */
export function formatToolExploringCommand(input: unknown): string {
  const record = inputRecord(input)
  if (!record) return ''
  if (Array.isArray(record.command)) return record.command.map(String).join(' ')
  if (typeof record.command === 'string') return record.command.trim()
  if (typeof record.scriptContent === 'string') return record.scriptContent.trim()
  if (typeof record.scriptRelativePath === 'string') {
    return record.scriptRelativePath.trim()
  }
  return ''
}
