import { scheduleUiFlush } from './scheduleUiFlush'
import { chatUiPerfMark, chatUiPerfMarkEnd } from './chatUiPerf'

type StoreMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  isStreaming?: boolean
  createdAt?: Date
}

type StoreStreamSyncDeps = {
  getVisibleConversationId: () => string | null
  getConversations: () => Record<string, StoreMessage[]>
}

let deps: StoreStreamSyncDeps | null = null

type PendingDelta = {
  conversationId: string
  assistantId: string
  delta: string
}

type PendingStepProgress = {
  conversationId: string
  assistantId: string
  content: string
}

/** Coalesced text for background (and visible) conversations — never apply mid-token for background. */
const pendingDeltas: PendingDelta[] = []
const pendingStepProgress = new Map<string, PendingStepProgress>()
/** Background: concatenate deltas per assistant so activate/end can flush once. */
const backgroundTextByKey = new Map<string, PendingDelta>()

function deltaKey(conversationId: string, assistantId: string): string {
  return `${conversationId}:${assistantId}`
}

export function initStoreStreamSync(next: StoreStreamSyncDeps): void {
  deps = next
}

export function queueStoreTextDelta(
  conversationId: string,
  assistantId: string,
  delta: string,
): void {
  if (!deps) return
  const visible = deps.getVisibleConversationId()
  const isBackground = Boolean(visible && visible !== conversationId)

  if (isBackground) {
    const key = deltaKey(conversationId, assistantId)
    const existing = backgroundTextByKey.get(key)
    if (existing) {
      existing.delta += delta
    } else {
      backgroundTextByKey.set(key, { conversationId, assistantId, delta })
    }
    return
  }

  pendingDeltas.push({ conversationId, assistantId, delta })
  scheduleUiFlush('store-sync', flushStoreStreamSync, {
    conversationId,
    priority: 'normal',
  })
}

export function queueStoreStepProgress(
  conversationId: string,
  assistantId: string,
  content: string,
): void {
  if (!deps) return
  const visible = deps.getVisibleConversationId()
  const key = deltaKey(conversationId, assistantId)
  const isBackground = Boolean(visible && visible !== conversationId)

  pendingStepProgress.set(key, { conversationId, assistantId, content })

  if (isBackground) {
    // Coalesce only — flush on activate / stream end.
    return
  }

  scheduleUiFlush('store-sync', flushStoreStreamSync, {
    conversationId,
    priority: 'normal',
  })
}

function applyStoreTextDelta(
  conversationId: string,
  assistantId: string,
  delta: string,
): void {
  if (!deps) return
  const convMessages = deps.getConversations()[conversationId]
  if (!convMessages) return
  const msg = convMessages.find((m) => m.id === assistantId)
  if (msg) msg.content += delta
}

function applyStoreStepProgress(
  conversationId: string,
  assistantId: string,
  content: string,
): void {
  if (!deps) return
  const convMessages = deps.getConversations()[conversationId]
  if (!convMessages) return
  const msg = convMessages.find((m) => m.id === assistantId)
  if (msg) msg.content = content
}

export function flushStoreStreamSync(): void {
  if (!deps) return
  chatUiPerfMark('store-sync')
  while (pendingDeltas.length > 0) {
    const item = pendingDeltas.shift()
    if (!item) break
    applyStoreTextDelta(item.conversationId, item.assistantId, item.delta)
  }
  for (const item of pendingStepProgress.values()) {
    applyStoreStepProgress(item.conversationId, item.assistantId, item.content)
  }
  pendingStepProgress.clear()
  chatUiPerfMarkEnd('store-sync')
}

/**
 * Apply coalesced background Pinia updates for one conversation (activate / stream end).
 */
export function flushStoreStreamSyncForConversation(
  conversationId: string,
): void {
  if (!deps) return
  const cid = conversationId.trim()
  if (!cid) return
  chatUiPerfMark('store-sync')

  for (const [key, item] of [...backgroundTextByKey.entries()]) {
    if (item.conversationId !== cid) continue
    applyStoreTextDelta(item.conversationId, item.assistantId, item.delta)
    backgroundTextByKey.delete(key)
  }

  for (const [key, item] of [...pendingStepProgress.entries()]) {
    if (item.conversationId !== cid) continue
    applyStoreStepProgress(item.conversationId, item.assistantId, item.content)
    pendingStepProgress.delete(key)
  }

  // Also drain any visible-style pending deltas for this conversation.
  const remaining: PendingDelta[] = []
  while (pendingDeltas.length > 0) {
    const item = pendingDeltas.shift()
    if (!item) break
    if (item.conversationId === cid) {
      applyStoreTextDelta(item.conversationId, item.assistantId, item.delta)
    } else {
      remaining.push(item)
    }
  }
  pendingDeltas.push(...remaining)
  chatUiPerfMarkEnd('store-sync')
}

export function syncStoreAssistantFromUiMessage(
  conversationId: string,
  assistantId: string,
  parts: Array<{ type: string; text?: string }>,
): void {
  if (!deps) return
  flushStoreStreamSyncForConversation(conversationId)
  const convMessages = deps.getConversations()[conversationId]
  if (!convMessages) return
  const row = convMessages.find((m) => m.id === assistantId)
  if (!row) return
  row.content = parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('\n\n')
  row.isStreaming = false
}

export function resetStoreStreamSync(): void {
  pendingDeltas.length = 0
  pendingStepProgress.clear()
  backgroundTextByKey.clear()
}
