import { scheduleUiFlush } from './scheduleUiFlush'

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

const pendingDeltas: PendingDelta[] = []
const pendingStepProgress = new Map<string, PendingStepProgress>()

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
  if (visible && visible !== conversationId) {
    applyStoreTextDelta(conversationId, assistantId, delta)
    return
  }
  pendingDeltas.push({ conversationId, assistantId, delta })
  scheduleUiFlush(
    'store-sync',
    flushStoreStreamSync,
    { conversationId, priority: 'normal' },
  )
}

export function queueStoreStepProgress(
  conversationId: string,
  assistantId: string,
  content: string,
): void {
  if (!deps) return
  const visible = deps.getVisibleConversationId()
  const key = `${conversationId}:${assistantId}`
  if (visible && visible !== conversationId) {
    applyStoreStepProgress(conversationId, assistantId, content)
    return
  }
  pendingStepProgress.set(key, { conversationId, assistantId, content })
  scheduleUiFlush(
    'store-sync',
    flushStoreStreamSync,
    { conversationId, priority: 'normal' },
  )
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
  while (pendingDeltas.length > 0) {
    const item = pendingDeltas.shift()
    if (!item) break
    applyStoreTextDelta(item.conversationId, item.assistantId, item.delta)
  }
  for (const item of pendingStepProgress.values()) {
    applyStoreStepProgress(item.conversationId, item.assistantId, item.content)
  }
  pendingStepProgress.clear()
}

export function syncStoreAssistantFromUiMessage(
  conversationId: string,
  assistantId: string,
  parts: Array<{ type: string; text?: string }>,
): void {
  if (!deps) return
  flushStoreStreamSync()
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
}
