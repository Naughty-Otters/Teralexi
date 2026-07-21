/**
 * Context overflow prevention for the tool-loop agent.
 *
 * Two complementary mechanisms:
 *
 * 1. applyToolOutputTruncation — wraps each tool's execute() to cap its output
 *    size before the AI SDK adds it to the rolling message thread.
 *    Applied inside buildAgentToolSet after guardrails, before dedup.
 *
 * 2. pruneOldToolResultsFromMessages — pre-flight pass run on the initial
 *    messages just before agent.stream().  When the message array (typically
 *    from a HITL-resume path) already exceeds the char budget, old tool-result
 *    messages are replaced with compact one-line summaries so the stream starts
 *    within budget.
 *
 * Why char-based budgets?  Token counts require an API call or a local
 * tokeniser.  4 chars ≈ 1 token is a well-established rough estimate that is
 * consistent with how hermes-agent and the AI SDK itself budget context.
 */

import { createLogger } from '@main/logger'
import type { ModelMessage } from '@teralexi-ai'
import { scoreThreadTags } from './thread-tagger'
import { SUB_AGENT_TOOL_NAMES } from '@toolSet/sub-agents'

const log = createLogger('agent.expr.context-overflow-guard')

// ---------------------------------------------------------------------------
// Config defaults (exported so callers can tune without magic numbers)
// ---------------------------------------------------------------------------

/** Max chars for a single tool output.  ~3 K tokens at 4 chars/token. */
export const DEFAULT_TOOL_OUTPUT_CHAR_CAP = 12_000

/**
 * Cap for subagent tool results. Must stay ≥ {@link SUB_AGENT_BRIEF_SUMMARY_MAX_CHARS}
 * so research briefs are not double-truncated after the brief builder.
 */
export const SUB_AGENT_TOOL_OUTPUT_CHAR_CAP = 32_000

/** Total char budget across all initial messages before pruning triggers.
 *  ~37 K tokens — leaves headroom for system instructions and the live loop. */
export const DEFAULT_MESSAGE_CHAR_BUDGET = 150_000

/** Number of most-recent tool-call/result rounds to preserve intact when
 *  pruning old results.  Older rounds are summarised. */
export const DEFAULT_PRESERVE_RECENT_ROUNDS = 3

/** How much file text to keep in pruned read_file summaries so the model knows
 *  it already loaded the path. */
export const READ_FILE_PRUNE_PREVIEW_CHARS = 500

// ---------------------------------------------------------------------------
// Mechanism 1 — tool output truncation (execute() wrapper)
// ---------------------------------------------------------------------------

/**
 * Wrap every tool's execute() function in the toolset to cap its output.
 *
 * - String results exceeding `maxChars` are sliced and annotated.
 * - Object results have any large top-level string fields individually capped.
 * - Objects whose total JSON is under `maxChars` pass through unchanged.
 *
 * Must be called AFTER applyToolGuardrails so guardrails see original sizes,
 * and BEFORE applyPerStreamToolInputDedupe.
 */
export function applyToolOutputTruncation(
  toolSet: Record<string, unknown>,
  maxChars = DEFAULT_TOOL_OUTPUT_CHAR_CAP,
): void {
  for (const name of Object.keys(toolSet)) {
    const spec = toolSet[name] as Record<string, unknown> | null
    if (!spec || typeof spec['execute'] !== 'function') continue

    const cap = SUB_AGENT_TOOL_NAMES.has(name)
      ? Math.min(maxChars, SUB_AGENT_TOOL_OUTPUT_CHAR_CAP)
      : maxChars

    const origExecute = (spec['execute'] as (...a: unknown[]) => Promise<unknown>).bind(spec)
    spec['execute'] = async (input: unknown): Promise<unknown> => {
      try {
        const result = await origExecute(input)
        return truncateOutput(result, name, cap)
      } catch (err) {
        log.error('Tool execute failed before truncation', {
          toolName: name,
          errorMessage: err instanceof Error ? err.message : String(err),
        })
        throw err
      }
    }
  }
}

function truncateOutput(result: unknown, toolName: string, maxChars: number): unknown {
  if (typeof result === 'string') {
    if (result.length <= maxChars) return result
    const excess = result.length - maxChars
    log.debug('Tool output truncated (string)', { toolName, original: result.length, cap: maxChars })
    return (
      result.slice(0, maxChars) +
      `\n\n[${toolName}: output truncated — ${excess} chars removed, ${result.length} total. ` +
      `Use more targeted queries to retrieve specific parts.]`
    )
  }

  if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
    const obj = result as Record<string, unknown>
    let changed = false
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.length > maxChars) {
        const excess = v.length - maxChars
        out[k] =
          v.slice(0, maxChars) +
          `...[${excess} chars truncated in field "${k}"]`
        changed = true
      } else {
        out[k] = v
      }
    }
    if (changed) {
      log.debug('Tool output truncated (object field)', { toolName })
      return out
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Mechanism 2 — pre-flight message pruning
// ---------------------------------------------------------------------------

export interface PruneToolResultsOpts {
  /** Total char budget; pruning is skipped when under this. */
  charBudget?: number
  /** How many of the most-recent tool-result messages to leave intact. */
  preserveRecentRounds?: number
  /**
   * Active thread tag for this request.  When supplied, tool-result messages
   * whose content belongs to a different thread are pruned earlier (they get
   * fewer free rounds) than same-thread results.
   */
  currentThreadTag?: string
}

export interface PruneToolResultsResult {
  messages: ModelMessage[]
  /** Number of tool-result messages that were summarised. */
  pruned: number
  /** Estimated char count before pruning. */
  charsBefore: number
  /** Estimated char count after pruning. */
  charsAfter: number
}

/**
 * If `messages` exceeds the char budget, replace the outputs of old tool-result
 * messages with one-line summaries.  The most recent `preserveRecentRounds`
 * tool-result messages are preserved intact.
 *
 * Call this on the initial `messages` array just before `agent.stream()`.
 * For fresh (non-HITL) runs the messages are usually just a single user message
 * and this function returns immediately without modification.
 */
export function pruneOldToolResultsFromMessages(
  messages: ModelMessage[],
  opts: PruneToolResultsOpts = {},
): PruneToolResultsResult {
  const {
    charBudget = DEFAULT_MESSAGE_CHAR_BUDGET,
    preserveRecentRounds = DEFAULT_PRESERVE_RECENT_ROUNDS,
    currentThreadTag,
  } = opts

  const charsBefore = estimateTotalChars(messages)
  if (charsBefore <= charBudget) {
    return { messages, pruned: 0, charsBefore, charsAfter: charsBefore }
  }

  // Collect indices of all tool-result messages
  const toolMsgIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'tool') toolMsgIndices.push(i)
  }

  if (toolMsgIndices.length === 0) {
    return { messages, pruned: 0, charsBefore, charsAfter: charsBefore }
  }

  let toSummarise: number[]

  if (currentThreadTag && currentThreadTag !== 'general') {
    // Thread-aware pruning: cross-thread results get fewer free rounds.
    // Cross-thread: keep max(1, preserveRecentRounds - 1) recent rounds intact.
    const crossThreadKeep = Math.max(1, preserveRecentRounds - 1)
    toSummarise = []

    // Separate indices into same-thread and cross-thread buckets (newest first)
    const sameThreadIndices: number[] = []
    const crossThreadIndices: number[] = []
    for (const idx of toolMsgIndices) {
      const text = extractToolMessageText(messages[idx])
      if (isSameThreadToolMessage(text, currentThreadTag)) {
        sameThreadIndices.push(idx)
      } else {
        crossThreadIndices.push(idx)
      }
    }

    // Same-thread: prune all but the last `preserveRecentRounds`
    const oldSameThread = sameThreadIndices.slice(
      0,
      Math.max(0, sameThreadIndices.length - preserveRecentRounds),
    )
    // Cross-thread: prune all but the last `crossThreadKeep`
    const oldCrossThread = crossThreadIndices.slice(
      0,
      Math.max(0, crossThreadIndices.length - crossThreadKeep),
    )

    toSummarise = [...oldSameThread, ...oldCrossThread]

    log.debug('Thread-aware pruning plan', {
      currentThreadTag,
      sameThread: sameThreadIndices.length,
      crossThread: crossThreadIndices.length,
      pruningSameThread: oldSameThread.length,
      pruningCrossThread: oldCrossThread.length,
    })
  } else {
    // Standard recency-based pruning
    toSummarise = toolMsgIndices.slice(
      0,
      Math.max(0, toolMsgIndices.length - preserveRecentRounds),
    )
  }

  if (toSummarise.length === 0) {
    return { messages, pruned: 0, charsBefore, charsAfter: charsBefore }
  }

  const pruned = new Set(toSummarise)
  const out = messages.map((msg, i) => {
    if (!pruned.has(i)) return msg
    return summariseToolMessage(msg as ModelMessage & { role: 'tool' })
  })

  const charsAfter = estimateTotalChars(out)
  log.debug('Pre-flight message pruning applied', {
    charsBefore,
    charsAfter,
    prunedCount: toSummarise.length,
    totalToolMsgs: toolMsgIndices.length,
  })

  return { messages: out, pruned: toSummarise.length, charsBefore, charsAfter }
}

/**
 * Classify a tool-result message for pruning.  Defaults to same-thread unless
 * another tag clearly outscores the active thread (avoids mis-bucketing on
 * auth/error keywords in unrelated tool output).
 */
function isSameThreadToolMessage(text: string, currentThreadTag: string): boolean {
  const scores = scoreThreadTags(text)
  const currentScore = scores.find((s) => s.tag === currentThreadTag)?.score ?? 0
  // Tool output from the active run often lacks the user-turn tag (e.g. auth stack
  // traces during a testing task). Default to same-thread unless another tag clearly
  // dominates *and* the active tag also appears in the output.
  if (currentScore === 0) return true
  const top = scores[0]
  if (!top || top.tag === 'general' || top.tag === currentThreadTag) return true
  return top.score <= currentScore
}

/** Extract readable text from a tool-result message for tag scoring. */
function extractToolMessageText(msg: ModelMessage): string {
  const parts: string[] = []
  const content = msg.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    for (const p of content) {
      const part = p as Record<string, unknown>
      if (typeof part['toolName'] === 'string') parts.push(part['toolName'])
      if (typeof part['text'] === 'string') parts.push(part['text'])
      if (part['output'] != null) {
        const out = part['output'] as Record<string, unknown>
        if (typeof out['value'] === 'string') parts.push(out['value'].slice(0, 500))
      }
      if (part['input'] != null) {
        try {
          parts.push(JSON.stringify(part['input']).slice(0, 300))
        } catch { /* ignore */ }
      }
    }
  }
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateTotalChars(messages: ModelMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageChars(m), 0)
}

function estimateMessageChars(msg: ModelMessage): number {
  const c = msg.content
  if (typeof c === 'string') return c.length
  if (!Array.isArray(c)) return 64
  return c.reduce((sum, p) => {
    const part = p as Record<string, unknown>
    if (typeof part['text'] === 'string') return sum + part['text'].length
    if (typeof part['value'] === 'string') return sum + part['value'].length
    if (part['output'] != null) return sum + safeJsonLength(part['output'])
    if (part['input'] != null) return sum + safeJsonLength(part['input'])
    return sum + 128
  }, 0)
}

function safeJsonLength(v: unknown): number {
  if (typeof v === 'string') return v.length
  try {
    return JSON.stringify(v).length
  } catch {
    return 256
  }
}

function summariseToolMessage(
  msg: ModelMessage & { role: 'tool' },
): ModelMessage {
  const summarisedContent = msg.content.map((p) => {
    const part = p as Record<string, unknown>
    if (part['type'] !== 'tool-result') return p
    const toolName = typeof part['toolName'] === 'string' ? part['toolName'] : '?'
    const output = part['output']
    const inputPath = extractReadFilePathFromInput(part['input'])
    const summary = buildResultSummary(toolName, output, inputPath)
    return { ...part, output: { type: 'text' as const, value: summary } }
  })
  return { ...msg, content: summarisedContent } as ModelMessage
}

function extractReadFilePathFromInput(input: unknown): string | undefined {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return undefined
  }
  const path = (input as Record<string, unknown>).path
  return typeof path === 'string' && path.trim() ? path.trim() : undefined
}

function buildResultSummary(
  toolName: string,
  output: unknown,
  inputPath?: string,
): string {
  // output is ToolResultOutput: { type: 'text', value: string } | { type: 'json', value: ... }
  const o = output as Record<string, unknown> | null
  if (!o) return `[${toolName}: (empty result, pruned)]`

  if (o['type'] === 'text' && typeof o['value'] === 'string') {
    if (toolName === 'read_file') {
      return buildReadFilePrunedSummaryFromText(o['value'], inputPath)
    }
    const text = o['value']
    const chars = text.length
    const preview = text.slice(0, 80).replace(/\n/g, ' ').trim()
    return `[${toolName}: ${chars} chars output (pruned). Preview: "${preview}${chars > 80 ? '...' : ''}"]`
  }

  if (o['type'] === 'json' && o['value'] != null) {
    return buildJsonResultSummary(
      toolName,
      o['value'] as Record<string, unknown>,
      inputPath,
    )
  }

  // Raw object (not yet wrapped in ToolResultOutput)
  if (typeof o === 'object') {
    return buildJsonResultSummary(toolName, o as Record<string, unknown>, inputPath)
  }

  return `[${toolName}: result pruned (${safeJsonLength(output)} chars)]`
}

function buildReadFilePrunedSummaryFromText(
  text: string,
  inputPath?: string,
): string {
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return buildReadFilePrunedSummary(
        parsed as Record<string, unknown>,
        inputPath,
      )
    }
  } catch {
    /* plain file text */
  }

  const pathLine = inputPath ? `read_file: ${inputPath}` : 'read_file:'
  const preview = text.slice(0, READ_FILE_PRUNE_PREVIEW_CHARS)
  const ellipsis = text.length > READ_FILE_PRUNE_PREVIEW_CHARS ? '...' : ''
  return `${pathLine}\n${preview}${ellipsis}\n(full content pruned)`
}

export function buildReadFilePrunedSummary(
  value: Record<string, unknown>,
  inputPath?: string,
): string {
  const path =
    (typeof value.path === 'string' && value.path.trim()) ||
    inputPath ||
    '(unknown path)'

  if (typeof value.error === 'string' && value.error) {
    return `read_file: ${path}\n${value.error}\n(pruned)`
  }

  if (value.isDirectory === true) {
    const count = Array.isArray(value.entries) ? value.entries.length : undefined
    const listing =
      count != null ? `directory, ${count} entries` : 'directory'
    return `read_file: ${path} (${listing}) (full content pruned)`
  }

  if (typeof value.content === 'string') {
    const preview = value.content.slice(0, READ_FILE_PRUNE_PREVIEW_CHARS)
    const ellipsis =
      value.content.length > READ_FILE_PRUNE_PREVIEW_CHARS ? '...' : ''
    return `read_file: ${path}\n${preview}${ellipsis}\n(full content pruned)`
  }

  return buildGenericJsonResultSummary('read_file', value)
}

function buildJsonResultSummary(
  toolName: string,
  value: Record<string, unknown>,
  inputPath?: string,
): string {
  if (toolName === 'read_file') {
    return buildReadFilePrunedSummary(value, inputPath)
  }
  return buildGenericJsonResultSummary(toolName, value)
}

function buildGenericJsonResultSummary(
  toolName: string,
  value: Record<string, unknown>,
): string {
  const chars = safeJsonLength(value)
  const parts: string[] = []

  if (typeof value['exit_code'] === 'number') parts.push(`exit_code=${value['exit_code']}`)
  if (typeof value['success'] === 'boolean') parts.push(`success=${value['success']}`)
  if (typeof value['error'] === 'string' && value['error']) {
    parts.push(`error="${value['error'].slice(0, 60)}"`)
  }
  if (parts.length === 0) {
    const topKeys = Object.keys(value).slice(0, 3).join(', ')
    if (topKeys) parts.push(`keys: ${topKeys}`)
  }

  const detail = parts.length > 0 ? `${parts.join(', ')}, ` : ''
  return `[${toolName}: ${detail}${chars} chars (pruned)]`
}
