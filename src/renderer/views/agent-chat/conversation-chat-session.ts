import { shallowRef } from 'vue'
import { Chat } from '@teralexi-ai/vue'
import type { UIMessage } from '@teralexi-ai'

import { chatUiPerfMark, chatUiPerfMarkEnd } from './perf/chatUiPerf'
import {
  isChatUiWorkerAvailable,
  workerCloneUiMessages,
} from './perf/chatUiWorkerClient'

export type QueuedUserMessage = {
  id: string
  text: string
  attachmentSourcePaths?: string[]
}

/** Survives {@link ChatPanel} remounts; holds live {@link Chat} + UI snapshots per conversation. */
const chatsByConversationId = new Map<string, InstanceType<typeof Chat>>()
const uiSnapshotsByConversationId = new Map<string, UIMessage[]>()
/** Conversations whose live Chat advanced since the last deep snapshot clone. */
const dirtySnapshotByConversationId = new Set<string>()
const messageQueuesByConversationId = new Map<string, QueuedUserMessage[]>()
const lastAccessedAtByConversationId = new Map<string, number>()
/** While set, queued user messages must not be sent (form submit / tool approval pending). */
const hitlBlocksQueueByConversationId = new Set<string>()
/**
 * Bumped whenever {@link setConversationHitlBlocksQueue} mutates the set so Vue
 * computeds (composer wait banner, dequeue gates) re-evaluate.
 */
export const hitlBlocksQueueEpoch = shallowRef(0)

/** Keep this many idle (not in-flight) cached chats beyond the ones we just touched. */
export const IDLE_CHAT_CACHE_LIMIT = 8

export type SyncConversationSnapshotOptions = {
  /**
   * When false, skip the expensive deep clone during stream coalesce and mark
   * the snapshot dirty. Clone still runs if no snapshot exists yet (bootstrap).
   * Default true (switch / stream end / stash).
   */
  clone?: boolean
}

export function cloneUiMessages(messages: UIMessage[]): UIMessage[] {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(messages)
    } catch {
      // Fall through for non-cloneable values.
    }
  }
  return JSON.parse(JSON.stringify(messages)) as UIMessage[]
}

function touchConversation(conversationId: string): void {
  lastAccessedAtByConversationId.set(conversationId, Date.now())
}

export function setConversationChat(
  conversationId: string,
  chat: InstanceType<typeof Chat>,
): void {
  if (!conversationId.trim()) return
  chatsByConversationId.set(conversationId, chat)
  touchConversation(conversationId)
  syncConversationSnapshot(conversationId, { clone: true })
}

export function stashConversationChat(
  conversationId: string,
  chat: InstanceType<typeof Chat>,
  queue: readonly QueuedUserMessage[],
): void {
  if (!conversationId.trim()) return
  chatsByConversationId.set(conversationId, chat)
  touchConversation(conversationId)
  syncConversationSnapshot(conversationId, { clone: true })
  if (queue.length > 0) {
    messageQueuesByConversationId.set(conversationId, [...queue])
  }
}

export function syncConversationSnapshot(
  conversationId: string,
  options: SyncConversationSnapshotOptions = {},
): void {
  chatUiPerfMark('snapshot')
  const chat = chatsByConversationId.get(conversationId)
  if (!chat?.messages?.length) {
    chatUiPerfMarkEnd('snapshot')
    return
  }
  const messages = chat.messages as UIMessage[]
  const wantClone = options.clone !== false
  const hasSnap = uiSnapshotsByConversationId.has(conversationId)

  // Soft stream flush: keep last clone, mark dirty for leave/end/hydrate.
  if (!wantClone && hasSnap) {
    dirtySnapshotByConversationId.add(conversationId)
    chatUiPerfMarkEnd('snapshot')
    return
  }

  dirtySnapshotByConversationId.delete(conversationId)
  uiSnapshotsByConversationId.set(conversationId, cloneUiMessages(messages))
  chatUiPerfMarkEnd('snapshot')

  // Large histories: refine snapshot off the UI thread when the worker is up.
  if (messages.length >= 20 && isChatUiWorkerAvailable()) {
    const gen = messages.length
    void workerCloneUiMessages([...messages]).then((cloned) => {
      const current = chatsByConversationId.get(conversationId)
      if (!current || current.messages?.length !== gen) return
      if (dirtySnapshotByConversationId.has(conversationId)) return
      uiSnapshotsByConversationId.set(conversationId, cloned)
    })
  }
}

/** Force a deep clone if the snapshot is missing or marked dirty. */
export function ensureConversationSnapshot(conversationId: string): void {
  if (!conversationId.trim()) return
  if (
    dirtySnapshotByConversationId.has(conversationId) ||
    !uiSnapshotsByConversationId.has(conversationId)
  ) {
    syncConversationSnapshot(conversationId, { clone: true })
  }
}

export function getConversationChat(
  conversationId: string,
): InstanceType<typeof Chat> | undefined {
  const chat = chatsByConversationId.get(conversationId)
  if (chat) touchConversation(conversationId)
  return chat
}

/**
 * Returns a cloned snapshot for hydrate. Prefer {@link peekConversationSnapshot}
 * when the caller will not mutate.
 */
/**
 * Returns a cloned snapshot for hydrate. Prefer {@link peekConversationSnapshot}
 * when the caller will not mutate.
 */
export function getConversationSnapshot(
  conversationId: string,
): UIMessage[] | undefined {
  ensureConversationSnapshot(conversationId)
  const snap = uiSnapshotsByConversationId.get(conversationId)
  return snap?.length ? cloneUiMessages(snap) : undefined
}

/**
 * Read-only snapshot reference — do not mutate.
 * May be stale while a soft stream flush has marked the conversation dirty;
 * use {@link getConversationSnapshot} / {@link ensureConversationSnapshot}
 * when freshness matters.
 */
export function peekConversationSnapshot(
  conversationId: string,
): readonly UIMessage[] | undefined {
  const snap = uiSnapshotsByConversationId.get(conversationId)
  return snap?.length ? snap : undefined
}

export function getConversationQueue(conversationId: string): QueuedUserMessage[] {
  return [...(messageQueuesByConversationId.get(conversationId) ?? [])]
}

export function setConversationHitlBlocksQueue(
  conversationId: string,
  blocked: boolean,
): void {
  if (!conversationId.trim()) return
  const before = hitlBlocksQueueByConversationId.has(conversationId)
  if (blocked) hitlBlocksQueueByConversationId.add(conversationId)
  else hitlBlocksQueueByConversationId.delete(conversationId)
  const after = hitlBlocksQueueByConversationId.has(conversationId)
  if (before !== after) hitlBlocksQueueEpoch.value += 1
}

export function conversationHitlBlocksQueue(conversationId: string): boolean {
  void hitlBlocksQueueEpoch.value
  return hitlBlocksQueueByConversationId.has(conversationId)
}

export function clearConversationChatCache(conversationId: string): void {
  if (!conversationId.trim()) return
  chatsByConversationId.delete(conversationId)
  uiSnapshotsByConversationId.delete(conversationId)
  dirtySnapshotByConversationId.delete(conversationId)
  lastAccessedAtByConversationId.delete(conversationId)
}

export function clearConversationSession(conversationId: string): void {
  if (!conversationId.trim()) return
  clearConversationChatCache(conversationId)
  messageQueuesByConversationId.delete(conversationId)
  if (hitlBlocksQueueByConversationId.delete(conversationId)) {
    hitlBlocksQueueEpoch.value += 1
  }
}

type EvictOptions = {
  /** Return true while the conversation still has a live stream (must keep Chat). */
  isStreamActive?: (conversationId: string) => boolean
  /** Conversation ids that must not be evicted (e.g. on-screen panes). */
  keepIds?: readonly string[]
  keepLimit?: number
}

/**
 * Drop idle cached Chat instances beyond {@link IDLE_CHAT_CACHE_LIMIT}, keeping
 * in-flight streams and most-recently-touched chats.
 */
export function evictIdleConversationChats(opts: EvictOptions = {}): void {
  const keepLimit = opts.keepLimit ?? IDLE_CHAT_CACHE_LIMIT
  const isActive = opts.isStreamActive
  const keepIds = new Set(
    (opts.keepIds ?? []).map((id) => id.trim()).filter(Boolean),
  )
  const idleIds = [...chatsByConversationId.keys()].filter((id) => {
    if (keepIds.has(id)) return false
    if (isActive?.(id)) return false
    return true
  })
  if (idleIds.length <= keepLimit) return
  idleIds.sort(
    (a, b) =>
      (lastAccessedAtByConversationId.get(a) ?? 0) -
      (lastAccessedAtByConversationId.get(b) ?? 0),
  )
  const toDrop = idleIds.slice(0, idleIds.length - keepLimit)
  for (const id of toDrop) {
    // Keep snapshot for cold hydrate; clone first if stream soft-flushes skipped it.
    ensureConversationSnapshot(id)
    chatsByConversationId.delete(id)
    lastAccessedAtByConversationId.delete(id)
  }
}

/** Test helper. */
export function resetConversationChatSessionForTests(): void {
  chatsByConversationId.clear()
  uiSnapshotsByConversationId.clear()
  dirtySnapshotByConversationId.clear()
  messageQueuesByConversationId.clear()
  lastAccessedAtByConversationId.clear()
  hitlBlocksQueueByConversationId.clear()
  hitlBlocksQueueEpoch.value = 0
}
