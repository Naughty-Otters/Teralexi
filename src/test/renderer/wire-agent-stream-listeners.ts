import type { FakeIpcChannel } from '@test/ipc/fake-ipc-channel'
import {
  flushStoreStreamSync,
  initStoreStreamSync,
  queueStoreStepProgress,
  queueStoreTextDelta,
  syncStoreAssistantFromUiMessage,
} from '@renderer/views/agent-chat/perf/storeStreamSync'
import {
  flushAllUiForConversation,
  resetChatUiFlushState,
  setChatUiFlushSchedulers,
} from '@renderer/views/agent-chat/perf/scheduleUiFlush'

export type StoreMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  isStreaming?: boolean
}

export type AgentStreamListenerStore = {
  conversations: Record<string, StoreMessage[]>
  getVisibleConversationId: () => string | null
  markAssistantMessageFinished: (
    conversationId: string,
    assistantId: string,
  ) => void
}

function renderLiveStepProgress(chunk: Record<string, unknown>): string {
  const data = chunk.data
  if (!data || typeof data !== 'object') return ''
  const content = (data as { content?: unknown }).content
  return typeof content === 'string' ? content : ''
}

/** Mirrors AgentChat.vue stream IPC listeners for integration tests. */
export function wireAgentChatStreamListeners(
  ipc: FakeIpcChannel,
  store: AgentStreamListenerStore,
): () => void {
  initStoreStreamSync({
    getVisibleConversationId: store.getVisibleConversationId,
    getConversations: () => store.conversations,
  })

  const onStringChunk = (
    _event: unknown,
    payload: { conversationId: string; assistantId: string; chunk: string },
  ) => {
    const convMessages = store.conversations[payload.conversationId]
    if (!convMessages) return
    const msg = convMessages.find((m) => m.id === payload.assistantId)
    if (!msg) return
    queueStoreTextDelta(payload.conversationId, payload.assistantId, payload.chunk)
  }

  const onUiChunk = (
    _event: unknown,
    payload: {
      conversationId: string
      assistantId: string
      chunk: Record<string, unknown>
    },
  ) => {
    const convMessages = store.conversations[payload.conversationId]
    if (!convMessages) return
    const msg = convMessages.find((m) => m.id === payload.assistantId)
    if (!msg) return
    if (payload.chunk?.type === 'data-agent-step-progress') {
      queueStoreStepProgress(
        payload.conversationId,
        payload.assistantId,
        renderLiveStepProgress(payload.chunk),
      )
      return
    }
    if (payload.chunk?.type !== 'text-delta') return
    const delta = payload.chunk.delta
    if (typeof delta !== 'string' || !delta) return
    queueStoreTextDelta(payload.conversationId, payload.assistantId, delta)
  }

  const onFinished = (
    _event: unknown,
    payload: { conversationId: string; assistantId: string },
  ) => {
    flushStoreStreamSync()
    syncStoreAssistantFromUiMessage(payload.conversationId, payload.assistantId, [
      {
        type: 'text',
        text: store.conversations[payload.conversationId]?.find(
          (m) => m.id === payload.assistantId,
        )?.content,
      },
    ])
    store.markAssistantMessageFinished(payload.conversationId, payload.assistantId)
    flushAllUiForConversation(payload.conversationId)
  }

  const stringChannel = ipc.AgentStreamChunk as {
    on?: (listener: typeof onStringChunk) => void
  }
  const uiChannel = ipc.AgentUIMessageChunk as {
    on?: (listener: typeof onUiChunk) => void
  }
  const finishedChannel = ipc.AgentStreamFinished as {
    on?: (listener: typeof onFinished) => void
  }

  stringChannel.on?.(onStringChunk)
  uiChannel.on?.(onUiChunk)
  finishedChannel.on?.(onFinished)

  return () => {
    ;(ipc.AgentStreamChunk as { removeAllListeners?: () => void })?.removeAllListeners?.()
    ;(ipc.AgentUIMessageChunk as { removeAllListeners?: () => void })?.removeAllListeners?.()
    ;(ipc.AgentStreamFinished as { removeAllListeners?: () => void })?.removeAllListeners?.()
    resetChatUiFlushState()
  }
}

export function useImmediateUiFlush(): () => void {
  setChatUiFlushSchedulers({
    raf: (cb) => {
      cb(performance.now())
      return 1
    },
    microtask: (cb) => {
      cb()
    },
  })
  return () => {
    resetChatUiFlushState()
  }
}
