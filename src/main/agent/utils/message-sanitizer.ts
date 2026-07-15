/**
 * Message sanitization before tool-loop {@link Agent.stream} API calls.
 *
 * Applied from {@link sanitizeModelMessagesForAgent} (see `client-ui-messages.ts`)
 * for UI-built threads and for standalone tool-loop user-only messages.
 *
 * Applies four passes in order:
 *  1. Surrogate character stripping — lone UTF-16 surrogates → U+FFFD
 *  2. Tool-call input repair — malformed JSON strings in ToolCallPart.input → best-effort object
 *  3. Role alternation repair — drop stray tool messages, drop OpenAI-unsafe unanswered
 *     tool-calls (esp. after a later user turn), merge consecutive user/assistant messages
 *  4. Empty content normalization — remove messages whose content carries no usable text
 */

import type { ModelMessage } from '@teralexi-ai'
import { stripInjectorMessageMeta } from '../injection/injection-message-meta'

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface SanitizeResult {
  messages: ModelMessage[]
  /** Human-readable log of every mutation applied, for debug logging. */
  mutations: string[]
}

export function sanitizeMessages(messages: ModelMessage[]): SanitizeResult {
  const mutations: string[] = []

  let out = stripSurrogates(messages, mutations)
  out = repairToolCallInputs(out, mutations)
  out = repairRoleAlternation(out, mutations)
  out = normalizeEmptyContent(out, mutations)

  out = stripInjectorMessageMeta(out)

  return { messages: out, mutations }
}

/**
 * True when some assistant `tool-call` still lacks a real `tool-result`.
 * Approval-only rounds count as incomplete — do not append injector user
 * messages yet, or OpenAI sees `tool_calls` then `user` (results land after).
 */
export function hasUnansweredToolCalls(messages: readonly ModelMessage[]): boolean {
  const withResults = toolCallIdsWithResults(messages as ModelMessage[])
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    for (const id of assistantToolCallIds(msg as ModelMessage & { role: 'assistant' })) {
      if (!withResults.has(id)) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Pass 1 — surrogate stripping
// ---------------------------------------------------------------------------

const SURROGATE_RE = /[\uD800-\uDFFF]/g

function cleanSurrogates(s: string): string {
  return s.replace(SURROGATE_RE, '�')
}

function cleanString(s: string, label: string, mutations: string[]): string {
  const cleaned = cleanSurrogates(s)
  if (cleaned !== s) mutations.push(`surrogate stripped in ${label}`)
  return cleaned
}

function stripSurrogates(messages: ModelMessage[], mutations: string[]): ModelMessage[] {
  return messages.map((msg, i) => {
    const label = `message[${i}](role=${msg.role})`

    if (msg.role === 'system') {
      if (typeof msg.content === 'string') {
        const c = cleanString(msg.content, `${label}.content`, mutations)
        return c === msg.content ? msg : { ...msg, content: c }
      }
      return msg
    }

    if (msg.role === 'user') {
      const c = msg.content
      if (typeof c === 'string') {
        const cleaned = cleanString(c, `${label}.content`, mutations)
        return cleaned === c ? msg : { ...msg, content: cleaned }
      }
      if (Array.isArray(c)) {
        const parts = c.map((p, pi) => {
          const part = p as Record<string, unknown>
          if (part.type === 'text' && typeof part.text === 'string') {
            const t = cleanString(part.text, `${label}.parts[${pi}].text`, mutations)
            return t === part.text ? p : { ...part, text: t }
          }
          return p
        })
        const changed = parts.some((p, pi) => p !== c[pi])
        return changed ? ({ ...msg, content: parts } as ModelMessage) : msg
      }
      return msg
    }

    if (msg.role === 'assistant') {
      const c = msg.content
      if (typeof c === 'string') {
        const cleaned = cleanString(c, `${label}.content`, mutations)
        return cleaned === c ? msg : { ...msg, content: cleaned }
      }
      if (Array.isArray(c)) {
        const parts = c.map((p, pi) => {
          const part = p as Record<string, unknown>
          if (
            (part.type === 'text' || part.type === 'reasoning') &&
            typeof part.text === 'string'
          ) {
            const t = cleanString(part.text, `${label}.parts[${pi}].text`, mutations)
            return t === part.text ? p : { ...part, text: t }
          }
          return p
        })
        const changed = parts.some((p, pi) => p !== c[pi])
        return changed ? ({ ...msg, content: parts } as ModelMessage) : msg
      }
      return msg
    }

    if (msg.role === 'tool') {
      const parts = msg.content.map((p, pi) => {
        const part = p as Record<string, unknown>
        if (typeof part.output === 'string') {
          const t = cleanString(part.output, `${label}.content[${pi}].output`, mutations)
          return t === part.output ? p : { ...part, output: t }
        }
        return p
      })
      const changed = parts.some((p, pi) => p !== msg.content[pi])
      return changed ? ({ ...msg, content: parts } as ModelMessage) : msg
    }

    return msg
  })
}

// ---------------------------------------------------------------------------
// Pass 2 — tool-call input repair
// ---------------------------------------------------------------------------

/**
 * Attempt to parse a raw string as JSON with multi-pass repair.
 * Returns the parsed object on success, or undefined on irreparable failure.
 */
function tryRepairJson(raw: string, toolName: string, mutations: string[]): unknown {
  // Fast path — already valid JSON string
  try {
    const r = JSON.parse(raw)
    mutations.push(`tool-call input JSON parsed from string for ${toolName}`)
    return r
  } catch {
    // fall through to repair
  }

  let candidate = raw.trim()

  // Remove trailing commas before closing brackets/braces
  candidate = candidate.replace(/,(\s*[}\]])/g, '$1')
  try {
    const r = JSON.parse(candidate)
    mutations.push(`tool-call input JSON trailing-comma repaired for ${toolName}`)
    return r
  } catch {
    // fall through
  }

  // Close unclosed structures
  const opens = [...candidate].reduce((acc, ch) => {
    if (ch === '{') acc.push('}')
    else if (ch === '[') acc.push(']')
    else if (ch === '}' || ch === ']') acc.pop()
    return acc
  }, [] as string[])
  if (opens.length > 0) {
    const closed = candidate + opens.reverse().join('')
    try {
      const r = JSON.parse(closed)
      mutations.push(`tool-call input JSON unclosed-structure repaired for ${toolName}`)
      return r
    } catch {
      // fall through
    }
  }

  // Strip control characters (except tab/newline/carriage-return)
  const stripped = candidate.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  if (stripped !== candidate) {
    try {
      const r = JSON.parse(stripped)
      mutations.push(`tool-call input JSON control-chars stripped for ${toolName}`)
      return r
    } catch {
      // fall through
    }
  }

  mutations.push(
    `tool-call input JSON irreparable for ${toolName}, fell back to parse-error object`,
  )
  const rawSnippet = raw.length > 500 ? `${raw.slice(0, 500)}…` : raw
  return {
    _toolInputParseError: true,
    _rawInput: rawSnippet,
  }
}

function repairToolCallInputs(messages: ModelMessage[], mutations: string[]): ModelMessage[] {
  return messages.map((msg) => {
    if (msg.role !== 'assistant') return msg
    const c = msg.content
    if (typeof c === 'string' || !Array.isArray(c)) return msg

    let changed = false
    const parts = c.map((p) => {
      const part = p as Record<string, unknown>
      if (part.type !== 'tool-call') return p
      if (typeof part.input !== 'string') return p
      // input is a string — needs JSON repair
      const repaired = tryRepairJson(part.input as string, String(part.toolName ?? '?'), mutations)
      changed = true
      return { ...part, input: repaired }
    })

    return changed ? ({ ...msg, content: parts } as ModelMessage) : msg
  })
}

// ---------------------------------------------------------------------------
// Pass 3 — role alternation repair
// ---------------------------------------------------------------------------

/**
 * Collect all toolCallIds declared in ToolCallPart entries of an assistant message.
 */
function assistantToolCallIds(msg: ModelMessage & { role: 'assistant' }): Set<string> {
  const ids = new Set<string>()
  const c = msg.content
  if (Array.isArray(c)) {
    for (const p of c) {
      const part = p as Record<string, unknown>
      if (part.type === 'tool-call' && typeof part.toolCallId === 'string') {
        ids.add(part.toolCallId)
      }
      if (
        part.type === 'tool-approval-request' &&
        typeof part.toolCallId === 'string'
      ) {
        ids.add(part.toolCallId)
      }
    }
  }
  return ids
}

/** HITL approval responses live on tool rows without a toolCallId. */
function isRetainedToolMessagePart(
  part: Record<string, unknown>,
  declaredToolCallIds: Set<string>,
): boolean {
  const type = typeof part.type === 'string' ? part.type : ''
  if (type === 'tool-approval-response') {
    const approvalId = part.approvalId
    return typeof approvalId === 'string' && approvalId.trim().length > 0
  }
  const id = typeof part.toolCallId === 'string' ? part.toolCallId : ''
  return declaredToolCallIds.has(id)
}

/**
 * Collect toolCallIds that have a real `tool-result` (OpenAI-safe resolution).
 */
function toolCallIdsWithResults(messages: ModelMessage[]): Set<string> {
  const ids = new Set<string>()
  for (const msg of messages) {
    if (msg.role !== 'tool' || !Array.isArray(msg.content)) continue
    for (const p of msg.content) {
      const part = p as Record<string, unknown>
      if (
        part.type === 'tool-result' &&
        typeof part.toolCallId === 'string' &&
        part.toolCallId.trim()
      ) {
        ids.add(part.toolCallId.trim())
      }
    }
  }
  return ids
}

/**
 * Map approvalId → toolCallId from assistant `tool-approval-request` parts.
 */
function approvalIdToToolCallId(messages: ModelMessage[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue
    for (const p of msg.content) {
      const part = p as Record<string, unknown>
      if (
        part.type === 'tool-approval-request' &&
        typeof part.approvalId === 'string' &&
        part.approvalId.trim() &&
        typeof part.toolCallId === 'string' &&
        part.toolCallId.trim()
      ) {
        map.set(part.approvalId.trim(), part.toolCallId.trim())
      }
    }
  }
  return map
}

/**
 * Index of the first user/system message after message index `from` (exclusive start).
 * Used to decide whether unanswered tool calls are still "pending resume" or stale.
 */
function indexOfLaterNonToolTurn(
  messages: ModelMessage[],
  from: number,
): number {
  for (let i = from + 1; i < messages.length; i++) {
    const role = messages[i]?.role
    if (role === 'user' || role === 'system') return i
  }
  return -1
}

/**
 * OpenAI requires every assistant `tool_calls` id to have a following tool result.
 *
 * Only strip when a later user/system turn follows the incomplete round — that is the
 * form-submit / "try again" failure mode. Leave trailing HITL approval-resume shapes
 * (tool-call + approval-response, no later user) and mid-repair unit fixtures alone.
 */
function stripOpenAiUnsafeUnansweredToolCalls(
  messages: ModelMessage[],
  mutations: string[],
): ModelMessage[] {
  const withResults = toolCallIdsWithResults(messages)

  const out: ModelMessage[] = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      out.push(msg)
      continue
    }

    // Completing a tool round mid-thread without a later user is fine for HITL resume.
    if (indexOfLaterNonToolTurn(messages, i) < 0) {
      out.push(msg)
      continue
    }

    let stripped = 0
    const kept = msg.content.filter((p) => {
      const part = p as Record<string, unknown>
      const type = typeof part.type === 'string' ? part.type : ''
      if (type !== 'tool-call' && type !== 'tool-approval-request') return true
      const id =
        typeof part.toolCallId === 'string' ? part.toolCallId.trim() : ''
      if (!id) {
        stripped++
        return false
      }
      if (withResults.has(id)) return true
      stripped++
      return false
    })

    if (stripped > 0) {
      mutations.push(
        `stripped ${stripped} unanswered tool-call part(s) (OpenAI tool_call pairing)`,
      )
    }
    if (kept.length === 0) {
      mutations.push('dropped assistant message left empty after unanswered tool-call strip')
      continue
    }
    out.push(
      kept.length === msg.content.length
        ? msg
        : ({ ...msg, content: kept } as ModelMessage),
    )
  }

  // Drop orphan tool parts that belonged to stripped tool-calls. Approval responses
  // must map to a still-declared approval-request (isRetainedToolMessagePart alone
  // keeps any approvalId, which would leave OpenAI-invalid / validator-orphan rows).
  const declared = new Set<string>()
  for (const msg of out) {
    if (msg.role === 'assistant') {
      for (const id of assistantToolCallIds(msg as ModelMessage & { role: 'assistant' })) {
        declared.add(id)
      }
    }
  }
  const remainingApprovalToTool = approvalIdToToolCallId(out)
  const cleaned: ModelMessage[] = []
  for (const msg of out) {
    if (msg.role !== 'tool' || !Array.isArray(msg.content)) {
      cleaned.push(msg)
      continue
    }
    const kept = msg.content.filter((p) => {
      const part = p as Record<string, unknown>
      const type = typeof part.type === 'string' ? part.type : ''
      if (type === 'tool-approval-response') {
        const approvalId =
          typeof part.approvalId === 'string' ? part.approvalId.trim() : ''
        const toolCallId = approvalId
          ? remainingApprovalToTool.get(approvalId)
          : undefined
        return Boolean(toolCallId && declared.has(toolCallId))
      }
      return isRetainedToolMessagePart(part, declared)
    })
    if (kept.length === 0) {
      mutations.push('dropped tool message orphaned by unanswered tool-call strip')
      continue
    }
    if (kept.length !== msg.content.length) {
      mutations.push(
        `removed ${msg.content.length - kept.length} orphaned tool part(s) after tool-call strip`,
      )
      cleaned.push({ ...msg, content: kept } as ModelMessage)
      continue
    }
    cleaned.push(msg)
  }
  return cleaned
}

function assistantContentToParts(content: unknown): Array<Record<string, unknown>> {
  if (typeof content === 'string') {
    const trimmed = content.trim()
    return trimmed ? [{ type: 'text', text: content }] : []
  }
  if (Array.isArray(content)) {
    return content.filter(
      (p): p is Record<string, unknown> => typeof p === 'object' && p !== null,
    )
  }
  return []
}

function mergeAssistantContent(prevContent: unknown, curContent: unknown): unknown {
  const prevParts = assistantContentToParts(prevContent)
  const curParts = assistantContentToParts(curContent)
  const merged = [...prevParts, ...curParts]
  if (merged.length === 0) return ''
  if (
    merged.every(
      (p) => p.type === 'text' && typeof p.text === 'string',
    )
  ) {
    return merged
      .map((p) => String(p.text))
      .filter(Boolean)
      .join('\n\n')
  }
  if (merged.length === 1) {
    const only = merged[0]!
    if (only.type === 'text' && typeof only.text === 'string') {
      return only.text
    }
  }
  return merged
}

function mergeConsecutiveAssistantMessages(
  prev: ModelMessage & { role: 'assistant' },
  cur: ModelMessage & { role: 'assistant' },
): ModelMessage {
  return {
    role: 'assistant',
    content: mergeAssistantContent(prev.content, cur.content),
  } as ModelMessage
}

function repairRoleAlternation(messages: ModelMessage[], mutations: string[]): ModelMessage[] {
  // Build the set of all toolCallIds present in assistant messages
  const declaredToolCallIds = new Set<string>()
  for (const msg of messages) {
    if (msg.role === 'assistant') {
      for (const id of assistantToolCallIds(msg)) {
        declaredToolCallIds.add(id)
      }
    }
  }

  // Drop stray tool messages whose results reference undeclared toolCallIds
  const destrayed: ModelMessage[] = []
  for (const msg of messages) {
    if (msg.role === 'tool') {
      const orphaned = msg.content.filter((p) => {
        const part = p as Record<string, unknown>
        return !isRetainedToolMessagePart(part, declaredToolCallIds)
      })
      if (orphaned.length === msg.content.length) {
        mutations.push(`dropped stray tool message (${orphaned.length} orphaned result(s))`)
        continue
      }
      if (orphaned.length > 0) {
        const kept = msg.content.filter((p) => {
          const part = p as Record<string, unknown>
          return isRetainedToolMessagePart(part, declaredToolCallIds)
        })
        mutations.push(`removed ${orphaned.length} orphaned result(s) from tool message`)
        destrayed.push({ ...msg, content: kept } as ModelMessage)
        continue
      }
    }
    destrayed.push(msg)
  }

  // Drop unanswered assistant tool-calls that OpenAI would reject (form-submit /
  // "try again" after approval-requested or approval-only rounds).
  const pruned = stripOpenAiUnsafeUnansweredToolCalls(destrayed, mutations)

  // Merge consecutive user / assistant messages
  const merged: ModelMessage[] = []
  for (const msg of pruned) {
    const prev = merged.length > 0 ? merged[merged.length - 1] : undefined
    if (msg.role === 'assistant' && prev?.role === 'assistant') {
      merged[merged.length - 1] = mergeConsecutiveAssistantMessages(
        prev as ModelMessage & { role: 'assistant' },
        msg as ModelMessage & { role: 'assistant' },
      )
      mutations.push('merged consecutive assistant messages')
      continue
    }
    if (msg.role === 'user' && prev?.role === 'user') {
      const prevText = typeof prev.content === 'string' ? prev.content : ''
      const curText = typeof msg.content === 'string' ? msg.content : ''
      if (prevText && curText) {
        merged[merged.length - 1] = {
          ...prev,
          content: `${prevText}\n\n${curText}`,
        } as ModelMessage
        mutations.push('merged consecutive user messages')
        continue
      }
      // One side is empty or has array content: prefer whichever has non-empty string content
      if (!prevText && curText) {
        merged[merged.length - 1] = msg
        mutations.push('replaced empty user message with subsequent non-empty user message')
        continue
      }
      // prev is non-empty or both are non-string: drop cur
      mutations.push('dropped duplicate consecutive user message')
      continue
    }
    merged.push(msg)
  }

  return merged
}

// ---------------------------------------------------------------------------
// Pass 4 — empty content normalization
// ---------------------------------------------------------------------------

function isContentEmpty(content: unknown): boolean {
  if (content === '' || content === null || content === undefined) return true
  if (Array.isArray(content) && content.length === 0) return true
  return false
}

function normalizeEmptyContent(messages: ModelMessage[], mutations: string[]): ModelMessage[] {
  return messages.filter((msg, i) => {
    if (isContentEmpty(msg.content)) {
      mutations.push(`removed message[${i}](role=${msg.role}) with empty content`)
      return false
    }
    return true
  })
}
