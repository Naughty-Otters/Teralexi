import { isToolOrDynamicToolUIPart, type UIMessage } from '@teralexi-ai'

export function flattenAssistantPartsToContent(msg: UIMessage): string {
  const chunks: string[] = []
  for (const part of msg.parts) {
    if (part.type === 'text') chunks.push(part.text ?? '')
    else if (part.type === 'data-agent-step-progress') {
      continue
    } else if (part.type === 'data-sub-agent-run') {
      continue
    } else if (typeof part.type === 'string' && part.type.startsWith('data-')) {
      const id = (part as { id?: string }).id ?? ''
      chunks.push(`[${part.type}${id ? `:${id}` : ''}]`)
    }
  }
  return chunks.join('\n\n').trim()
}

/** If the same `id` appears more than once (e.g. SDK/state edge cases), keep the last row. */
export function dedupeMessagesByIdLastWins(
  messages: readonly UIMessage[],
): UIMessage[] {
  if (messages.length <= 1) return [...messages]
  const lastIndexById = new Map<string, number>()
  for (let i = 0; i < messages.length; i++) {
    lastIndexById.set(messages[i].id, i)
  }
  const out: UIMessage[] = []
  for (let i = 0; i < messages.length; i++) {
    if (lastIndexById.get(messages[i].id) !== i) continue
    out.push(messages[i])
  }
  return out
}

/** True if assistant row may still be receiving stream/tool updates. */
export function assistantRowLooksInFlight(m: UIMessage): boolean {
  if (m.role !== 'assistant') return false
  for (const p of m.parts) {
    if (p.type === 'reasoning' && p.state === 'streaming') return true
    if (p.type === 'text' && p.state === 'streaming') return true
    if (
      isToolOrDynamicToolUIPart(p) &&
      p.state !== 'output-available' &&
      p.state !== 'output-error' &&
      p.state !== 'output-denied' &&
      p.state !== 'approval-responded'
    ) {
      return true
    }
  }
  return false
}

/** Same visible assistant payload (text + tools); ids may differ after bad appends. */
export function consecutiveAssistantRowsEquivalent(
  a: UIMessage,
  b: UIMessage,
): boolean {
  if (a.role !== 'assistant' || b.role !== 'assistant') return false
  if (assistantRowLooksInFlight(a) || assistantRowLooksInFlight(b)) return false
  return JSON.stringify(a.parts) === JSON.stringify(b.parts)
}

/**
 * HITL / SDK quirks can append a second assistant row with a new id but the same
 * parts as the previous assistant. Keep the newer row.
 */
export function dedupeConsecutiveDuplicateAssistantRows(
  messages: UIMessage[],
): UIMessage[] {
  if (messages.length <= 1) return messages
  const out: UIMessage[] = []
  for (const m of messages) {
    const prev = out[out.length - 1]
    if (
      prev &&
      prev.role === 'assistant' &&
      m.role === 'assistant' &&
      prev.id !== m.id &&
      consecutiveAssistantRowsEquivalent(prev, m)
    ) {
      out[out.length - 1] = m
      continue
    }
    out.push(m)
  }
  return out
}

/** Same assistant answer echoed twice as separate text blocks (split stream / bug). */
export function mergeAdjacentDuplicateAssistantTextParts(
  msg: UIMessage,
): UIMessage {
  if (msg.role !== 'assistant' || msg.parts.length < 2) return msg
  const next: UIMessage['parts'] = []
  for (const p of msg.parts) {
    const prev = next[next.length - 1]
    if (
      p.type === 'text' &&
      prev?.type === 'text' &&
      (prev.text ?? '').trim().length > 0 &&
      (prev.text ?? '').trim() === (p.text ?? '').trim()
    ) {
      continue
    }
    next.push(p)
  }
  if (next.length === msg.parts.length) return msg
  return { ...msg, parts: next }
}

/** Consecutive assistant bubbles with the same visible text (different ids / parts JSON). */
export function dedupeConsecutiveAssistantsSameVisibleText(
  messages: UIMessage[],
): UIMessage[] {
  if (messages.length <= 1) return messages
  const out: UIMessage[] = []
  for (const m of messages) {
    const prev = out[out.length - 1]
    const text = m.role === 'assistant' ? flattenAssistantPartsToContent(m) : ''
    const prevText =
      prev?.role === 'assistant' ? flattenAssistantPartsToContent(prev) : ''
    if (
      prev &&
      prev.role === 'assistant' &&
      m.role === 'assistant' &&
      prev.id !== m.id &&
      text.length > 0 &&
      text === prevText &&
      !assistantRowLooksInFlight(prev) &&
      !assistantRowLooksInFlight(m)
    ) {
      out[out.length - 1] = m
      continue
    }
    out.push(m)
  }
  return out
}

export function normalizeSingleMessage(msg: UIMessage): UIMessage {
  return msg.role === 'assistant'
    ? mergeAdjacentDuplicateAssistantTextParts(msg)
    : msg
}

function partsStructureSignature(msg: UIMessage): string {
  return msg.parts
    .map((p) => {
      if (typeof p.type !== 'string') return '?'
      if (p.type.startsWith('data-')) {
        return `${p.type}:${(p as { id?: string }).id ?? ''}`
      }
      return p.type
    })
    .join('|')
}

function canIncrementalTailUpdate(
  raw: readonly UIMessage[],
  prev: readonly UIMessage[],
): boolean {
  if (raw.length === 0 || raw.length !== prev.length) return false
  for (let i = 0; i < raw.length - 1; i++) {
    if (raw[i].id !== prev[i]?.id) return false
    if (partsStructureSignature(raw[i]) !== partsStructureSignature(prev[i])) {
      return false
    }
  }
  const tail = raw[raw.length - 1]
  const prevTail = prev[prev.length - 1]
  if (!tail || !prevTail) return false
  if (tail.id !== prevTail.id) return false
  if (partsStructureSignature(tail) !== partsStructureSignature(prevTail)) {
    return false
  }
  return tail.role === 'assistant' && assistantRowLooksInFlight(tail)
}

/**
 * During streaming, patch only the tail assistant row instead of re-normalizing
 * the full array on every text delta.
 */
export function incrementalSyncChatMessages(
  raw: readonly UIMessage[],
  prev: UIMessage[],
): UIMessage[] {
  const deduped = dedupeMessagesByIdLastWins(raw)
  if (deduped.length === 0) return []
  if (prev.length === 0 || !canIncrementalTailUpdate(deduped, prev)) {
    return normalizeChatMessagesForDisplay(raw)
  }
  const next = [...prev]
  const tail = deduped[deduped.length - 1]
  next[next.length - 1] = normalizeSingleMessage(tail)
  return next
}

export function normalizeChatMessagesForDisplay(
  raw: readonly UIMessage[],
): UIMessage[] {
  let m = dedupeMessagesByIdLastWins(raw)
  m = dedupeConsecutiveDuplicateAssistantRows(m)
  m = dedupeConsecutiveAssistantsSameVisibleText(m)
  return m.map((msg) => normalizeSingleMessage(msg))
}

function assistantTextLength(msg: UIMessage): number {
  return msg.parts
    .filter((p) => p.type === 'text')
    .map((p) => ('text' in p ? (p.text ?? '') : ''))
    .join('')
    .trim().length
}

function markAssistantPartsDone(msg: UIMessage): UIMessage {
  if (msg.role !== 'assistant') return msg
  return {
    ...msg,
    parts: msg.parts.map((part) => {
      if (part.type === 'text' && part.state === 'streaming') {
        return { ...part, state: 'done' as const }
      }
      return part
    }),
  }
}

function partsHaveInterleavedToolsAndProgress(
  parts: UIMessage['parts'],
): boolean {
  let lastProgressIndex = -1
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part.type === 'data-agent-step-progress') {
      lastProgressIndex = i
      continue
    }
    if (!isToolOrDynamicToolUIPart(part) || lastProgressIndex < 0) continue
    for (let j = i + 1; j < parts.length; j++) {
      if (parts[j].type === 'data-agent-step-progress') return true
    }
  }
  return false
}

/** Merge persisted store rows into live Chat SDK rows without dropping step-progress parts. */
export function mergeAssistantMessageFromStore(
  live: UIMessage,
  store: UIMessage,
): UIMessage {
  const storeTextParts = store.parts.filter((p) => p.type === 'text')
  const liveTextParts = live.parts.filter((p) => p.type === 'text')
  const textParts =
    assistantTextLength(store) >= assistantTextLength(live)
      ? storeTextParts
      : liveTextParts

  if (partsHaveInterleavedToolsAndProgress(live.parts)) {
    const textIter = textParts[Symbol.iterator]()
    const mergedParts = live.parts.map((part) => {
      if (part.type !== 'text') return part
      const next = textIter.next()
      if (next.done) return { ...part, state: 'done' as const }
      return { ...next.value, state: 'done' as const }
    })
    return markAssistantPartsDone({ ...store, parts: mergedParts })
  }

  const progressParts = live.parts.filter(
    (p) => p.type === 'data-agent-step-progress',
  )
  const otherParts = live.parts.filter(
    (p) => p.type !== 'text' && p.type !== 'data-agent-step-progress',
  )

  return markAssistantPartsDone({
    ...store,
    parts: [
      ...textParts.map((p) =>
        p.type === 'text' ? { ...p, state: 'done' as const } : p,
      ),
      ...progressParts,
      ...otherParts,
    ],
  })
}

/**
 * Reconcile live Chat SDK messages with DB rows after a run finishes.
 * Never replace a richer in-memory assistant turn with text-only store rows.
 */
export function mergeLiveChatMessagesWithStore(
  live: readonly UIMessage[],
  fromStore: readonly UIMessage[],
): UIMessage[] {
  if (fromStore.length === 0) {
    return live.map((m) =>
      m.role === 'assistant' ? markAssistantPartsDone(m) : m,
    )
  }
  if (live.length === 0) return [...fromStore]

  const storeById = new Map(fromStore.map((m) => [m.id, m]))
  const merged: UIMessage[] = []

  for (const liveMsg of live) {
    const storeMsg = storeById.get(liveMsg.id)
    if (!storeMsg) {
      merged.push(
        liveMsg.role === 'assistant' ? markAssistantPartsDone(liveMsg) : liveMsg,
      )
      continue
    }
    storeById.delete(liveMsg.id)
    merged.push(
      liveMsg.role === 'assistant'
        ? mergeAssistantMessageFromStore(liveMsg, storeMsg)
        : storeMsg,
    )
  }

  for (const storeMsg of storeById.values()) {
    merged.push(storeMsg)
  }

  return merged
}

/** @deprecated Use {@link mergeLiveChatMessagesWithStore}. */
export function preferLiveMessagesOverIncompleteStoreReload(
  live: readonly UIMessage[],
  fromStore: readonly UIMessage[],
): UIMessage[] {
  return mergeLiveChatMessagesWithStore(live, fromStore)
}
