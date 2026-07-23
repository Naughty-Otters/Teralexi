import {
  isToolOrDynamicToolUIPart,
  type UIMessagePart,
  type UITools,
} from '@teralexi-ai'
import { isFileChangeToolName } from '@shared/file-change/types'
import { parseToolFileChanges } from '@shared/file-change/parse-tool-file-changes'
import { normalizeTodos, type TrackedTodo } from '@shared/agent/todos'
import { inferToolResultType } from '@shared/tool-result/infer-tool-result-type'
import {
  extractTerminalTextFromResult,
  formatToolResultForDisplay,
} from '@shared/tool-result/format-tool-result-for-display'
import { isToolResultType, type ToolResultType } from '@shared/tool-result/types'

const TODO_TOOL_NAMES = new Set(['update_todos', 'read_todos', 'exit_plan_mode'])

export function isExitPlanModeToolPart(part: unknown): boolean {
  return toolPartDisplayName(part) === 'exit_plan_mode'
}

export function isTodoToolPart(part: unknown): boolean {
  return TODO_TOOL_NAMES.has(toolPartDisplayName(part))
}

/** Extract the tracked todo list from an update_todos/read_todos tool result. */
export function parseTodoToolPart(part: unknown): TrackedTodo[] | null {
  if (!isTodoToolPart(part)) return null
  const output = getToolPartOutput(part)
  if (!output || typeof output !== 'object') return null
  const todos = (output as { todos?: unknown }).todos
  if (!Array.isArray(todos)) return null
  return normalizeTodos(todos as Array<Record<string, unknown>>)
}

export function toolPartNeedsApproval(part: unknown): boolean {
  const p = part as UIMessagePart<any, UITools>
  return isToolOrDynamicToolUIPart(p) && p.state === 'approval-requested'
}

/** Only pending HITL approval is shown in chat; auto-run and completed tools are hidden. */
export function shouldShowToolPartInChat(part: unknown): boolean {
  return toolPartNeedsApproval(part)
}

/**
 * True when this tool part went through human approval (or denial). Those rows
 * keep full params / id / result. Auto-run tools have no `approval` object (see
 * AI SDK `ToolUIPart` — optional `approval` only after approve on `output-available`).
 */
export function toolPartInvolvedUserApproval(part: unknown): boolean {
  if (!part || typeof part !== 'object') return false
  const p = part as Record<string, unknown>
  const state = typeof p.state === 'string' ? p.state : ''
  if (state === 'approval-responded') return true
  if (state === 'output-denied') return true
  const ap = p.approval
  if (ap && typeof ap === 'object' && ap !== null && 'id' in ap) return true
  return false
}

export function toolPartDisplayName(part: unknown): string {
  const p = part as UIMessagePart<any, UITools>
  if (!isToolOrDynamicToolUIPart(p)) return 'tool'
  if (p.type === 'dynamic-tool') return p.toolName
  return p.type.startsWith('tool-')
    ? p.type.slice('tool-'.length)
    : p.type
}

export function getToolPartInput(part: unknown): unknown {
  const p = part as UIMessagePart<any, UITools>
  if (!isToolOrDynamicToolUIPart(p)) return undefined
  return p.input
}

export function getToolPartOutput(part: unknown): unknown {
  const p = part as UIMessagePart<any, UITools>
  if (!isToolOrDynamicToolUIPart(p)) return undefined
  return p.output
}

export function isFileChangeToolPart(part: unknown): boolean {
  return isFileChangeToolName(toolPartDisplayName(part))
}

/** Completed HITL file tools with diff output stay visible in chat. */
export function shouldShowApprovedFileChangePart(part: unknown): boolean {
  if (toolPartNeedsApproval(part)) return false
  if (!toolPartInvolvedUserApproval(part)) return false
  const state = getToolPartState(part)
  if (state !== 'output-available' && state !== 'output-error') return false
  if (!isFileChangeToolPart(part)) return false
  return parseToolFileChanges(getToolPartOutput(part)).length > 0
}

/**
 * True when a completed tool result carries file-change previews — including
 * incidental workspace writes from `shell` / `run_script` (no HITL required).
 */
export function shouldShowIncidentalFileChangePart(part: unknown): boolean {
  if (toolPartNeedsApproval(part)) return false
  const state = getToolPartState(part)
  if (state !== 'output-available' && state !== 'output-error') return false
  if (isFileChangeToolPart(part)) return false
  return parseToolFileChanges(getToolPartOutput(part)).length > 0
}

export function formatToolInput(part: unknown): string {
  const p = part as UIMessagePart<any, UITools>
  if (!isToolOrDynamicToolUIPart(p)) return ''
  try {
    return JSON.stringify(p.input ?? {}, null, 2)
  } catch {
    return String(p.input)
  }
}

/** Pretty-print any tool payload for display (input/output/error). */
export function formatToolPayload(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function getToolPartState(part: unknown): string {
  if (!part || typeof part !== 'object') return ''
  const s = (part as { state?: unknown }).state
  return typeof s === 'string' ? s : ''
}

export function getToolPartErrorText(part: unknown): string {
  if (!part || typeof part !== 'object') return ''
  const e = (part as { errorText?: unknown }).errorText
  return typeof e === 'string' ? e : ''
}

export function formatToolOutput(part: unknown): string {
  const p = part as UIMessagePart<any, UITools>
  if (!isToolOrDynamicToolUIPart(p)) return ''
  return formatToolResultForDisplay(p.output, {
    toolName: toolPartDisplayName(part),
    toolInput: p.input,
  })
}

const STATE_META: Record<
  string,
  { label: string; tone: 'muted' | 'info' | 'warn' | 'success' | 'error' }
> = {
  'input-streaming': { label: 'Streaming', tone: 'info' },
  'input-available': { label: 'Ready', tone: 'info' },
  'approval-requested': { label: 'Needs approval', tone: 'warn' },
  'approval-responded': { label: 'Approved', tone: 'info' },
  'output-available': { label: 'Done', tone: 'success' },
  'output-error': { label: 'Failed', tone: 'error' },
  'output-denied': { label: 'Denied', tone: 'error' },
}

export function toolRunStatePresentation(state: string): {
  label: string
  tone: 'muted' | 'info' | 'warn' | 'success' | 'error'
} {
  const s = state.trim()
  if (STATE_META[s]) return STATE_META[s]
  return {
    label: s ? s.replace(/-/g, ' ') : 'Unknown',
    tone: 'muted',
  }
}

export function truncateDisplay(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen).trimEnd()}…`
}

export function getToolIcon(toolName: string): string {
  const n = toolName.toLowerCase()
  if (n === 'bash' || n === 'shell' || n === 'execute_command' || n === 'run_command') return 'i-lucide-terminal'
  if (n.includes('read') || n.includes('file_read') || n === 'cat') return 'i-lucide-file-text'
  if (n.includes('write') || n.includes('file_write') || n.includes('create_file')) return 'i-lucide-file-edit'
  if (n.includes('edit') || n.includes('patch') || n.includes('replace')) return 'i-lucide-file-diff'
  if (n.includes('search') || n.includes('grep') || n.includes('find') || n.includes('glob') || n.includes('list')) return 'i-lucide-search'
  if (n.includes('web') || n.includes('browse') || n.includes('fetch') || n.includes('http')) return 'i-lucide-globe'
  if (n.includes('todo') || n.includes('task') || n.includes('plan')) return 'i-lucide-check-square'
  if (n.includes('memory') || n.includes('remember') || n.includes('store')) return 'i-lucide-brain'
  if (n.includes('think') || n.includes('reason')) return 'i-lucide-lightbulb'
  if (n.includes('image') || n.includes('screenshot') || n.includes('vision')) return 'i-lucide-image'
  if (n.includes('code') || n.includes('python') || n.includes('js') || n.includes('script')) return 'i-lucide-code-2'
  if (n.includes('database') || n.includes('sql') || n.includes('query')) return 'i-lucide-database'
  if (n.includes('api') || n.includes('request') || n.includes('call')) return 'i-lucide-zap'
  if (n.includes('dir') || n.includes('folder') || n.includes('ls')) return 'i-lucide-folder'
  return 'i-lucide-wrench'
}

export function isRunningState(state: string): boolean {
  return state === 'input-streaming' || state === 'input-available'
}

/** Terminal bubble is still executing (including post-approval, pre-output). */
export function isTerminalToolRunning(part: unknown): boolean {
  const state = getToolPartState(part)
  if (isRunningState(state)) return true
  if (state !== 'approval-responded') return false
  const view = extractTerminalView(part)
  return view.output.trim().length === 0 && getToolPartErrorText(part).trim().length === 0
}

// ── Result-type classification (raw / file / terminal) ────────────────────────

/** Tools that run a command/script and produce terminal-style output. */
const TERMINAL_TOOL_NAMES = new Set([
  'run_script',
  'run_script_file',
  'shell',
])

/** Name-based check for command/terminal tools (usable before output exists). */
export function isTerminalCommandToolName(name: string): boolean {
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

export function isTerminalCommandToolPart(part: unknown): boolean {
  return isTerminalCommandToolName(toolPartDisplayName(part))
}

function asOutputRecord(part: unknown): Record<string, unknown> | null {
  const output = getToolPartOutput(part)
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null
  return output as Record<string, unknown>
}

/** Map stamped {@link ToolResultType} to legacy bubble classifier buckets. */
function bubbleKindFromResultType(
  resultType: ToolResultType,
): 'terminal' | 'file' | 'raw' {
  if (resultType === 'file_change') return 'file'
  if (resultType === 'terminal') return 'terminal'
  return 'raw'
}

/** Read `resultType` from tool output when the main process stamped it. */
export function getToolResultType(part: unknown): ToolResultType | null {
  const o = asOutputRecord(part)
  if (o && isToolResultType(o.resultType)) return o.resultType
  return null
}

/**
 * Classify a tool result so the UI can pick the right bubble:
 *  - 'file'     → file-change results (diff/code view)
 *  - 'terminal' → command/script output (stdout/stderr/exit code)
 *  - 'raw'      → everything else (generic JSON/text)
 *
 * Prefers `resultType` on the output object when present (set for every tool
 * in the tool loop via {@link normalizeToolResult}).
 */
export function classifyToolResult(part: unknown): 'terminal' | 'file' | 'raw' {
  const stamped = getToolResultType(part)
  if (stamped) return bubbleKindFromResultType(stamped)

  const name = toolPartDisplayName(part)
  const output = getToolPartOutput(part)
  const inferred = inferToolResultType(name, output)
  if (inferred !== 'raw' && inferred !== 'error' && inferred !== 'todo') {
    return bubbleKindFromResultType(inferred)
  }

  // File-change tools own the diff/code view.
  if (isFileChangeToolPart(part)) return 'file'

  const o = asOutputRecord(part)
  const hasTerminalShape =
    !!o &&
    ('stdout' in o ||
      'stderr' in o ||
      'exitCode' in o ||
      'resultContent' in o ||
      'captureAbsolutePath' in o ||
      (typeof o.output === 'string' && o.output.trim().length > 0))

  if (isTerminalCommandToolName(name) || hasTerminalShape) return 'terminal'

  // A non-file-named tool that still produced file changes.
  if (o && ('files' in o || 'written' in o || 'applied' in o || 'diff' in o)) {
    return 'file'
  }

  return 'raw'
}

export type TerminalView = {
  /** The command/script that ran (from the tool input). */
  command: string
  /** stdout/stderr (or other textual result) to show as terminal output. */
  output: string
  exitCode?: number
  success?: boolean
}

function extractTerminalCommand(
  name: string,
  input: Record<string, unknown> | null,
): string {
  if (!input) return ''
  // run_script: the inline script source.
  if (typeof input.scriptContent === 'string') return input.scriptContent
  // run_script_file: the script path + args.
  if (typeof input.scriptRelativePath === 'string') {
    const args = Array.isArray(input.scriptArgs) ? input.scriptArgs.join(' ') : ''
    return [input.scriptRelativePath, args].filter(Boolean).join(' ')
  }
  // shell: argv array or command + args.
  if (Array.isArray(input.command)) return input.command.join(' ')
  if (typeof input.command === 'string') {
    const args = Array.isArray(input.args) ? input.args.join(' ') : ''
    return [input.command, args].filter(Boolean).join(' ')
  }
  // git_* tools: render a readable `git <subcommand> …`.
  if (name.toLowerCase().startsWith('git_')) {
    const sub = name.slice('git_'.length).replace(/_/g, ' ')
    const extras: string[] = []
    if (typeof input.message === 'string') extras.push(`-m ${JSON.stringify(input.message)}`)
    if (Array.isArray(input.files)) extras.push(...input.files.map(String))
    if (typeof input.branch === 'string' && input.branch.trim()) extras.push(input.branch)
    if (input.staged === true) extras.push('--staged')
    return ['git', sub, ...extras].filter(Boolean).join(' ')
  }
  return formatToolPayload(input)
}

function extractTerminalOutput(output: unknown): {
  text: string
  exitCode?: number
  success?: boolean
} {
  if (output == null) return { text: '' }
  if (typeof output === 'string') return { text: output }
  if (typeof output !== 'object') return { text: formatToolPayload(output) }

  const o = output as Record<string, unknown>
  let text = extractTerminalTextFromResult(o)
  if (!text) {
    if (typeof o.error === 'string' && o.error.trim()) text = o.error
    else text = formatToolPayload(output)
  }

  const exitCode = typeof o.exitCode === 'number' ? o.exitCode : undefined
  const success =
    typeof o.success === 'boolean'
      ? o.success
      : typeof o.ok === 'boolean'
        ? o.ok
        : undefined

  return { text, exitCode, success }
}

/** Build a clean command + output view from a terminal-style tool part. */
export function extractTerminalView(part: unknown): TerminalView {
  const name = toolPartDisplayName(part)
  const input = (() => {
    const i = getToolPartInput(part)
    return i && typeof i === 'object' && !Array.isArray(i)
      ? (i as Record<string, unknown>)
      : null
  })()
  const command = extractTerminalCommand(name, input)
  const { text, exitCode, success } = extractTerminalOutput(getToolPartOutput(part))
  return { command, output: text, exitCode, success }
}

