/**
 * Pre-run conversation compaction.
 *
 * When the message history for a run exceeds a character budget, summarize the
 * older rounds into a single compact note — preserving the task, key decisions,
 * and (deterministically) the files read/modified — instead of silently
 * dropping old turns. Keeps recent rounds verbatim. Best-effort: any failure
 * returns the original messages unchanged so the run is never blocked.
 */
import type { ModelMessage } from '@teralexi-ai'
import {
  extractPathsFromPatchText,
  parseToolFileChanges,
} from '@shared/file-change/parse-tool-file-changes'
import type { AgentStepContext } from '../context'
import { runExpressionLlmText } from '../expr/run-expression-llm'
import { createLogger } from '@main/logger'

const log = createLogger('agent.compaction')

/** Default budget over which compaction kicks in (chars; ~1 token ≈ 4 chars). */
export const DEFAULT_COMPACTION_CHAR_BUDGET = 150_000
/** Complete user-delimited rounds always kept verbatim at the tail. */
export const DEFAULT_PRESERVE_RECENT_ROUNDS = 3
/** Cap on the text fed to the summarizer LLM. */
const MAX_SUMMARY_INPUT_CHARS = 60_000

const READ_TOOLS = new Set([
  'read_file',
  'list_files',
  'grep_files',
  'glob_files',
  'search_files',
])
const WRITE_TOOLS = new Set([
  'edit_files',
  'edit_file',
  'write_file',
  'apply_patch',
  'delete_file',
  'move_file',
  'copy_file',
  'promote_artifact',
])

export const COMPACTION_SYSTEM = `You compress an in-progress coding session into a concise hand-off summary so the agent can continue without the earlier transcript. Preserve:
- The user's goal / task.
- What has been done so far and the current state.
- Key decisions, constraints, and gotchas discovered.
- Anything still pending or in-progress.
Be factual and concise. Do NOT dump large code or file contents. Output plain text only (no preamble, no headings).`

// ── Pure helpers (exported for tests) ─────────────────────────────────────────

function contentChars(content: unknown): number {
  if (typeof content === 'string') return content.length
  if (!Array.isArray(content)) return 0
  let n = 0
  for (const part of content) {
    if (typeof part === 'string') n += part.length
    else if (part && typeof part === 'object') {
      const text = (part as { text?: unknown }).text
      if (typeof text === 'string') n += text.length
      else {
        try {
          n += JSON.stringify(part).length
        } catch {
          /* ignore */
        }
      }
    }
  }
  return n
}

export function estimateMessageChars(messages: ModelMessage[]): number {
  let total = 0
  for (const m of messages) total += contentChars(m.content)
  return total
}

function pickPath(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  for (const key of ['path', 'file', 'filePath', 'destination', 'move_path', 'source']) {
    const v = o[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

export type FileOps = { readFiles: string[]; modifiedFiles: string[] }

function recordToolCallFileOps(
  name: string,
  input: unknown,
  read: Set<string>,
  modified: Set<string>,
): void {
  if (name === 'apply_patch') {
    if (input && typeof input === 'object') {
      const patchText = (input as Record<string, unknown>).patch_text
      if (typeof patchText === 'string') {
        for (const path of extractPathsFromPatchText(patchText)) modified.add(path)
      }
    }
    return
  }
  if (name === 'edit_files' && input && typeof input === 'object') {
    const record = input as Record<string, unknown>
    if (record.mode === 'patch' && typeof record.patch_text === 'string') {
      for (const path of extractPathsFromPatchText(record.patch_text)) {
        modified.add(path)
      }
      return
    }
  }
  const path = pickPath(input)
  if (!path) return
  if (WRITE_TOOLS.has(name)) modified.add(path)
  else if (READ_TOOLS.has(name)) read.add(path)
}

function recordToolResultFileOps(
  name: string,
  output: unknown,
  read: Set<string>,
  modified: Set<string>,
): void {
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const record = output as Record<string, unknown>
    if (
      record.resultType === 'file_change' ||
      record.files ||
      record.diff ||
      record.written
    ) {
      for (const file of parseToolFileChanges(output)) modified.add(file.path)
    }
  }
  const path = pickPath(output)
  if (path && READ_TOOLS.has(name)) read.add(path)
}

/** Collect files read / modified from tool-call and tool-result parts across messages. */
export function extractFileOps(messages: ModelMessage[]): FileOps {
  const read = new Set<string>()
  const modified = new Set<string>()
  for (const m of messages) {
    const content = m.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const p = part as Record<string, unknown>
      const type = p.type
      const name = String(p.toolName ?? p.name ?? '')

      if (type === 'tool-call' || type === 'dynamic-tool-call') {
        recordToolCallFileOps(name, p.input ?? p.args, read, modified)
        continue
      }
      if (type === 'tool-result') {
        recordToolResultFileOps(name, p.output ?? p.result, read, modified)
      }
    }
  }
  return { readFiles: [...read], modifiedFiles: [...modified] }
}

/**
 * Index where the last `rounds` user-delimited rounds begin. Slicing here keeps
 * complete rounds intact (so we never orphan a tool-result from its tool-call).
 * Returns 0 when there aren't enough rounds to compact.
 */
export function findRecentRoundStart(
  messages: ModelMessage[],
  rounds: number,
): number {
  let userCount = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      userCount++
      // The Nth-from-last user message starts the first preserved round.
      if (userCount >= rounds) return i
    }
  }
  return 0
}

/**
 * When history reaches the configured message budget, reserve one slot for a
 * compaction note and keep the newest `budget - 1` messages verbatim.
 */
export function splitMessagesForMessageBudget(
  messages: ModelMessage[],
  messageBudget: number,
): { older: ModelMessage[]; recent: ModelMessage[] } | null {
  if (messageBudget < 2 || messages.length < messageBudget) return null
  const recentSlots = messageBudget - 1
  const start = messages.length - recentSlots
  if (start <= 0) return null
  return {
    older: messages.slice(0, start),
    recent: messages.slice(start),
  }
}

function renderContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const out: string[] = []
  for (const part of content) {
    if (typeof part === 'string') {
      out.push(part)
      continue
    }
    if (!part || typeof part !== 'object') continue
    const p = part as Record<string, unknown>
    if (p.type === 'text' && typeof p.text === 'string') out.push(p.text)
    else if (p.type === 'tool-call' || p.type === 'dynamic-tool-call') {
      out.push(`[tool-call ${String(p.toolName ?? '')}] ${safeJson(p.input ?? p.args)}`)
    } else if (p.type === 'tool-result') {
      out.push(`[tool-result ${String(p.toolName ?? '')}] ${safeJson(p.output ?? p.result)}`)
    }
  }
  return out.join('\n')
}

function safeJson(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function serializeMessagesForSummary(messages: ModelMessage[]): string {
  return messages
    .map((m) => `### ${m.role}\n${renderContent(m.content)}`)
    .join('\n\n')
}

export function buildCompactionNote(summary: string, fileOps: FileOps): string {
  const lines = ['## Compacted earlier context']
  const s = summary.trim()
  if (s) lines.push('', s)
  if (fileOps.readFiles.length > 0) {
    lines.push('', `Files read earlier: ${fileOps.readFiles.join(', ')}`)
  }
  if (fileOps.modifiedFiles.length > 0) {
    lines.push(`Files modified earlier: ${fileOps.modifiedFiles.join(', ')}`)
  }
  return lines.join('\n')
}

function truncateHead(text: string, max: number): string {
  if (text.length <= max) return text
  // Keep the TAIL (most recent) of the older block, which is most relevant.
  return `…(earlier omitted)…\n${text.slice(text.length - max)}`
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export type CompactionOptions = {
  charBudget?: number
  preserveRecentRounds?: number
  /** Compact when message count reaches this budget (reserves one slot for the note). */
  messageBudget?: number
  /** Summarize older rounds even when under the normal char budget (overflow recovery). */
  forceCompact?: boolean
  /** Thread tag for stored tool-result file-op recall. */
  threadTag?: string
  /** Optional user hint for manual `/compact` (appended to summarizer prompt). */
  compactionHint?: string
}

export type CompactionResult = {
  messages: ModelMessage[]
  compacted: boolean
}

/**
 * Compact `messages` when they exceed the budget. Never throws — returns the
 * input unchanged on any problem (the caller's prune pass remains the safety net).
 */
export async function compactConversationIfNeeded(
  ctx: AgentStepContext,
  messages: ModelMessage[],
  opts: CompactionOptions = {},
): Promise<CompactionResult> {
  try {
    const charBudget = opts.charBudget ?? DEFAULT_COMPACTION_CHAR_BUDGET
    const rounds = opts.preserveRecentRounds ?? DEFAULT_PRESERVE_RECENT_ROUNDS
    const messageBudget = opts.messageBudget

    const messageSplit =
      messageBudget != null
        ? splitMessagesForMessageBudget(messages, messageBudget)
        : null
    const charOverBudget = estimateMessageChars(messages) > charBudget
    const shouldCompactByChar =
      charOverBudget || (opts.forceCompact === true && !messageSplit)

    let older: ModelMessage[] = []
    let recent: ModelMessage[] = messages

    if (messageSplit) {
      older = messageSplit.older
      recent = messageSplit.recent
    } else if (shouldCompactByChar) {
      const start = findRecentRoundStart(messages, rounds)
      if (start <= 0) return { messages, compacted: false }
      older = messages.slice(0, start)
      recent = messages.slice(start)
    } else {
      return { messages, compacted: false }
    }

    if (older.length === 0) return { messages, compacted: false }

    const fileOps = extractFileOps(older)
    const serialized = truncateHead(
      serializeMessagesForSummary(older),
      MAX_SUMMARY_INPUT_CHARS,
    )

    const hintSuffix = opts.compactionHint?.trim()
      ? `\n\nUser compaction hint: ${opts.compactionHint.trim()}`
      : ''

    let summary = ''
    try {
      summary = await runExpressionLlmText(
        ctx,
        {
          instructions: COMPACTION_SYSTEM,
          userPrompt: `Summarize the following earlier conversation so the agent can continue without it:\n\n${serialized}${hintSuffix}`,
        },
        [],
        { streamToProgress: false, maxOutputTokens: 1200 },
      )
    } catch (err) {
      log.warn('Compaction summary LLM failed; preserving file-ops only', { err })
      summary = ''
    }

    // Even with no LLM summary, the deterministic file-op note is worth keeping.
    if (!summary.trim() && fileOps.readFiles.length === 0 && fileOps.modifiedFiles.length === 0) {
      return { messages, compacted: false }
    }

    const note: ModelMessage = {
      role: 'user',
      content: buildCompactionNote(summary, fileOps),
    }
    log.info('Compacted conversation history', {
      olderMessages: older.length,
      recentMessages: recent.length,
      filesRead: fileOps.readFiles.length,
      filesModified: fileOps.modifiedFiles.length,
      hadSummary: Boolean(summary.trim()),
    })
    return { messages: [note, ...recent], compacted: true }
  } catch (err) {
    log.warn('Compaction failed; using original messages', { err })
    return { messages, compacted: false }
  }
}
