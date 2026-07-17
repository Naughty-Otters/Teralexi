import { shallowRef } from 'vue'
import { Chat } from '@teralexi-ai/vue'
import type { UIMessage } from '@teralexi-ai'

import { chatUiPerfMark, chatUiPerfMarkEnd } from './perf/chatUiPerf'

export type QueuedUserMessage = {
  id: string
  text: string
  attachmentSourcePaths?: string[]
}

/** Survives {@link ChatPanel} remounts; holds live {@link Chat} + UI snapshots per conversation. */
const chatsByConversationId = new Map<string, InstanceType<typeof Chat>>()
const uiSnapshotsByConversationId = new Map<string, UIMessage[]>()
const messageQueuesByConversationId = new Map<string, QueuedUserMessage[]>()
/** While set, queued user messages must not be sent (form submit / tool approval pending). */
const hitlBlocksQueueByConversationId = new Set<string>()
/**
 * Bumped whenever {@link setConversationHitlBlocksQueue} mutates the set so Vue
 * computeds (composer wait banner, dequeue gates) re-evaluate.
 */
export const hitlBlocksQueueEpoch = shallowRef(0)

export function cloneUiMessages(messages: UIMessage[]): UIMessage[] {
  return JSON.parse(JSON.stringify(messages)) as UIMessage[]
}

export function setConversationChat(
  conversationId: string,
  chat: InstanceType<typeof Chat>,
): void {
  if (!conversationId.trim()) return
  chatsByConversationId.set(conversationId, chat)
  syncConversationSnapshot(conversationId)
}

export function stashConversationChat(
  conversationId: string,
  chat: InstanceType<typeof Chat>,
  queue: readonly QueuedUserMessage[],
): void {
  if (!conversationId.trim()) return
  chatsByConversationId.set(conversationId, chat)
  syncConversationSnapshot(conversationId)
  if (queue.length > 0) {
    messageQueuesByConversationId.set(conversationId, [...queue])
  }
}

export function syncConversationSnapshot(conversationId: string): void {
  chatUiPerfMark('snapshot')
  const chat = chatsByConversationId.get(conversationId)
  if (!chat?.messages?.length) return
  uiSnapshotsByConversationId.set(
    conversationId,
    cloneUiMessages(chat.messages),
  )
  chatUiPerfMarkEnd('snapshot')
}

export function getConversationChat(
  conversationId: string,
): InstanceType<typeof Chat> | undefined {
  return chatsByConversationId.get(conversationId)
}

export function getConversationSnapshot(
  conversationId: string,
): UIMessage[] | undefined {
  const snap = uiSnapshotsByConversationId.get(conversationId)
  return snap?.length ? cloneUiMessages(snap) : undefined
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
}

export function clearConversationSession(conversationId: string): void {
  if (!conversationId.trim()) return
  clearConversationChatCache(conversationId)
  messageQueuesByConversationId.delete(conversationId)
  if (hitlBlocksQueueByConversationId.delete(conversationId)) {
    hitlBlocksQueueEpoch.value += 1
  }
}
