import type { FakeIpcChannel } from './fake-ipc-channel'
import type {
  AgentStreamPayload,
  AgentStringChunkPayload,
  AgentUiMessageChunkPayload,
} from './stream-fixtures'
import {
  legacyStringChunk,
  streamFinishedPayload,
  textDeltaChunk,
} from './stream-fixtures'

export type AgentStreamDriver = {
  pushUiChunk: (payload: AgentUiMessageChunkPayload) => void
  pushStringChunk: (payload: AgentStringChunkPayload) => void
  pushTextDelta: (delta: string, textPartId?: string) => void
  pushLegacyString: (chunk: string) => void
  finish: () => void
  emitConversationStoreChanged: (conversationId: string) => void
}

export function createAgentStreamDriver(
  ipc: FakeIpcChannel,
  base: AgentStreamPayload,
): AgentStreamDriver {
  return {
    pushUiChunk(payload) {
      ipc.emit('AgentUIMessageChunk', payload)
    },
    pushStringChunk(payload) {
      ipc.emit('AgentStreamChunk', payload)
    },
    pushTextDelta(delta, textPartId) {
      this.pushUiChunk(textDeltaChunk(base, delta, textPartId))
    },
    pushLegacyString(chunk) {
      this.pushStringChunk(legacyStringChunk(base, chunk))
    },
    finish() {
      ipc.emit('AgentStreamFinished', streamFinishedPayload(base))
    },
    emitConversationStoreChanged(conversationId) {
      ipc.emit('ConversationStoreChanged', { conversationId })
    },
  }
}
