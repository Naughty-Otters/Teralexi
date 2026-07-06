/**
 * Thread-aware context injection for the tool-loop agent.
 *
 * When the agent is about to start a new stream, this module pulls historically
 * relevant messages from SQLite (same thread tag, earlier in the session) and
 * prepends them to the message array so the model can recall prior work on the
 * same topic — even if those exchanges have scrolled out of the recent window.
 *
 * Injection only happens when `windowOldestTs` bounds history to messages older
 * than the current UI window, and overlap filtering skips content already present.
 */

import { createLogger } from '@main/logger'
import { getConversationStore } from '@main/services/conversation-store'
import type { StoredMessage } from '@main/services/conversation-store/types'
import type { ModelMessage } from '@teralexi-ai'
import { extractThreadTag, type ThreadTag } from './thread-tagger'

const log = createLogger('agent.expr.thread-context-builder')

// ---------------------------------------------------------------------------
// Topic-switch detection
// ---------------------------------------------------------------------------

export interface TopicSwitchResult {
  switched: boolean
  /** Tag of the most-recent previous user message (undefined when no history). */
  previousTag?: ThreadTag
}

/**
 * Returns `true` when the current user turn is on a different thread tag than
 * the most-recent prior user message stored in the conversation.
 *
 * Used by the tool loop to decide whether to throw away cross-topic history
 * and start with a clean context, relying only on thread-local injection.
 */
const SHORT_FOLLOW_UP_RE =
  /^(yes|yeah|yep|sure|ok(?:ay)?|please|go ahead|do it|sounds good|that works|please do|export(?: it| the pdf)?|generate(?: it| the pdf)?|create the pdf)\b/i

/**
 * Resolve thread tag for context injection. Short follow-ups like "yes" inherit
 * the last substantive user turn's tag so prior work is not dropped.
 */
export function resolveEffectiveThreadTag(
  conversationId: string | undefined,
  text: string,
): ThreadTag {
  const direct = extractThreadTag(text)
  if (direct !== 'general') return direct

  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 120) return 'general'
  const looksLikeFollowUp =
    trimmed.length <= 80 &&
    (SHORT_FOLLOW_UP_RE.test(trimmed) || /^(yes|please)\b/i.test(trimmed))
  if (!looksLikeFollowUp || !conversationId?.trim()) return 'general'

  try {
    const stored = getConversationStore().getMessages(conversationId.trim())
    for (let i = stored.length - 1; i >= 0; i--) {
      const m = stored[i]
      if (m.role !== 'user') continue
      const storedTag = (m.threadTag ?? 'general') as ThreadTag
      if (storedTag !== 'general') return storedTag
      const extracted = extractThreadTag(m.content)
      if (extracted !== 'general') return extracted
    }
  } catch (err) {
    log.warn('resolveEffectiveThreadTag lookup failed', {
      conversationId,
      err,
    })
  }
  return 'general'
}

export function detectTopicSwitch(
  conversationId: string,
  currentTag: ThreadTag,
): TopicSwitchResult {
  // 'general' is intentionally broad — never treat it as a topic switch.
  if (currentTag === 'general') return { switched: false }
  try {
    const stored = getConversationStore().getMessages(conversationId)
    // Walk backwards to find the most recent user message (not the current one —
    // the current one hasn't been stored yet when this is called pre-run).
    for (let i = stored.length - 1; i >= 0; i--) {
      const m = stored[i]
      if (m.role !== 'user') continue
      const prevTag = (m.threadTag ?? 'general') as ThreadTag
      if (prevTag === 'general') continue   // skip untagged pivots
      const switched = prevTag !== currentTag
      return { switched, previousTag: prevTag }
    }
  } catch (err) {
    log.warn('detectTopicSwitch lookup failed', { conversationId, currentTag, err })
  }
  return { switched: false }
}

/** Maximum chars of injected thread history (prevents injecting too much). */
const MAX_INJECT_CHARS = 8_000

/** Maximum number of historical message pairs to inject. */
const MAX_INJECT_MESSAGES = 6

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ThreadContextOpts {
  conversationId: string
  currentTag: ThreadTag
  /** ISO timestamp of the oldest message already in the message window.
   *  History older than this may be injected if relevant. */
  windowOldestTs?: string
}

export interface ThreadContextResult {
  messages: ModelMessage[]
  injectedCount: number
  tag: ThreadTag
}

/**
 * Augment `existingMessages` with thread-relevant history from earlier in the
 * conversation.  Returns the original array unchanged when nothing useful is found.
 */
export function injectThreadContext(
  existingMessages: ModelMessage[],
  opts: ThreadContextOpts,
): ThreadContextResult {
  const { conversationId, currentTag, windowOldestTs } = opts

  if (currentTag === 'general') {
    return { messages: existingMessages, injectedCount: 0, tag: currentTag }
  }

  let historicalMessages: StoredMessage[]
  try {
    historicalMessages = getConversationStore().listMessagesByThread(
      conversationId,
      currentTag,
      { before: windowOldestTs, limit: MAX_INJECT_MESSAGES * 2 },
    )
  } catch (err) {
    log.warn('Thread context lookup failed', { conversationId, tag: currentTag, err })
    return { messages: existingMessages, injectedCount: 0, tag: currentTag }
  }

  if (historicalMessages.length === 0) {
    return { messages: existingMessages, injectedCount: 0, tag: currentTag }
  }

  const deduped = historicalMessages.filter(
    (h) => !overlapsCurrentWindow(h, existingMessages),
  )
  if (deduped.length === 0) {
    return { messages: existingMessages, injectedCount: 0, tag: currentTag }
  }

  const capped = capByChars(deduped, MAX_INJECT_CHARS)
  if (capped.length === 0) {
    return { messages: existingMessages, injectedCount: 0, tag: currentTag }
  }

  const preamble = buildPreamble(currentTag, capped)

  log.debug('Injecting thread context', {
    tag: currentTag,
    injectedMessages: capped.length,
    preambleMessages: preamble.length,
    windowOldestTs,
  })

  return {
    messages: [...preamble, ...existingMessages],
    injectedCount: capped.length,
    tag: currentTag,
  }
}

/**
 * Oldest ISO timestamp on UI chat rows (for bounding injected history).
 */
export function oldestClientUiMessageTimestamp(
  clientUi?: ReadonlyArray<{ createdAt?: string; metadata?: unknown }>,
): string | undefined {
  if (!clientUi?.length) return undefined
  let oldest: string | undefined
  for (const m of clientUi) {
    const meta =
      typeof m.metadata === 'object' && m.metadata !== null
        ? (m.metadata as { createdAt?: string })
        : undefined
    const ts =
      typeof m.createdAt === 'string' && m.createdAt.trim()
        ? m.createdAt.trim()
        : typeof meta?.createdAt === 'string' && meta.createdAt.trim()
          ? meta.createdAt.trim()
          : undefined
    if (!ts) continue
    if (!oldest || ts < oldest) oldest = ts
  }
  return oldest
}

/**
 * Oldest ISO timestamp from model-message parts (when UI rows carry createdAt).
 */
export function oldestMessageTimestamp(messages: ModelMessage[]): string | undefined {
  let oldest: string | undefined
  for (const msg of messages) {
    const c = msg.content
    if (!Array.isArray(c)) continue
    for (const part of c) {
      const p = part as Record<string, unknown>
      const ts = p['createdAt']
      if (typeof ts === 'string' && ts.trim()) {
        const t = ts.trim()
        if (!oldest || t < oldest) oldest = t
      }
    }
  }
  return oldest
}

/** Resolve injection window boundary from UI thread and/or model messages. */
export function resolveWindowOldestTimestamp(
  clientUi?: ReadonlyArray<{ createdAt?: string; metadata?: unknown }>,
  modelMessages?: ModelMessage[],
): string | undefined {
  return (
    oldestClientUiMessageTimestamp(clientUi) ??
    (modelMessages ? oldestMessageTimestamp(modelMessages) : undefined)
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capByChars(msgs: StoredMessage[], maxChars: number): StoredMessage[] {
  let total = 0
  const out: StoredMessage[] = []
  for (const m of msgs) {
    const len = m.content.length
    if (total + len > maxChars) break
    out.push(m)
    total += len
  }
  return out
}

function buildPreamble(tag: ThreadTag, historical: StoredMessage[]): ModelMessage[] {
  const contextBlock = historical
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`)
    .join('\n\n')

  return [
    {
      role: 'user',
      content:
        `[Earlier context for thread "${tag}" — from this session]\n\n` +
        contextBlock +
        `\n\n[End of earlier context]`,
    } as ModelMessage,
    {
      role: 'assistant',
      content: `Understood. I have the earlier "${tag}" context in mind.`,
    } as ModelMessage,
  ]
}

function messageWindowText(messages: ModelMessage[]): string {
  return messages
    .map((m) => {
      const c = m.content
      if (typeof c === 'string') return c
      if (Array.isArray(c)) {
        return c
          .map((p) => {
            const part = p as Record<string, unknown>
            if (typeof part['text'] === 'string') return part['text']
            if (typeof part['value'] === 'string') return part['value']
            return ''
          })
          .join('\n')
      }
      return ''
    })
    .join('\n')
}

function overlapsCurrentWindow(saved: StoredMessage, currentTurn: ModelMessage[]): boolean {
  const savedText = saved.content.trim()
  if (!savedText) return true
  const currentText = messageWindowText(currentTurn)
  if (!currentText) return false
  return currentText.includes(savedText) || savedText.includes(currentText)
}
