import { isFileChangeToolName } from '@shared/file-change/types'
import { QUERY_TOOL_NAMES } from './tool-result-payload'
import type { ToolResultType } from './types'

const TODO_TOOL_NAMES = new Set(['update_todos', 'read_todos'])

const TERMINAL_TOOL_NAMES = new Set([
  'run_script',
  'run_script_file',
  'shell',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function hasTerminalShape(record: Record<string, unknown>): boolean {
  return (
    'stdout' in record ||
    'stderr' in record ||
    'exitCode' in record ||
    'resultContent' in record ||
    'captureAbsolutePath' in record ||
    (typeof record.output === 'string' && record.output.trim().length > 0)
  )
}

function hasFileChangeShape(record: Record<string, unknown>): boolean {
  if (Array.isArray(record.files) && record.files.length > 0) return true
  if (typeof record.diff === 'string' && record.diff.trim()) return true
  if (
    record.written === true ||
    record.applied === true ||
    record.deleted === true ||
    record.moved === true ||
    record.copied === true ||
    record.promoted === true
  ) {
    return true
  }
  return false
}

function hasQueryShape(record: Record<string, unknown>): boolean {
  return (
    typeof record.content === 'string' ||
    Array.isArray(record.entries) ||
    typeof record.matches === 'string' ||
    Array.isArray(record.paths) ||
    Array.isArray(record.results) ||
    record.data !== undefined
  )
}

function isTerminalToolName(name: string): boolean {
  const n = name.toLowerCase()
  return (
    TERMINAL_TOOL_NAMES.has(n) ||
    n.startsWith('git_') ||
    n.startsWith('github_') ||
    n === 'bash' ||
    n === 'shell' ||
    n.includes('terminal') ||
    n.includes('shell_command') ||
    n.includes('execute_command') ||
    n.includes('run_command')
  )
}

/** Classify a tool result for UI routing (shape + tool name). */
export function inferToolResultType(
  toolName: string,
  result: unknown,
): ToolResultType {
  const record = asRecord(result)
  if (!record) {
    if (isTerminalToolName(toolName)) return 'terminal'
    return 'raw'
  }

  if (record.phase === 'preflight' && Array.isArray(record.issues)) {
    return 'error'
  }

  if (typeof record.error === 'string' && record.error.trim()) {
    const hasPayload =
      hasFileChangeShape(record) ||
      hasTerminalShape(record) ||
      Array.isArray(record.todos)
    if (!hasPayload) return 'error'
  }

  if (isFileChangeToolName(toolName) || hasFileChangeShape(record)) {
    return 'file_change'
  }

  if (TODO_TOOL_NAMES.has(toolName) || Array.isArray(record.todos)) {
    return 'todo'
  }

  if (QUERY_TOOL_NAMES.has(toolName) || hasQueryShape(record)) {
    return 'query'
  }

  if (isTerminalToolName(toolName) || hasTerminalShape(record)) {
    return 'terminal'
  }

  return 'raw'
}
