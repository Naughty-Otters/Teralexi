import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  createFakeIpcChannel,
  installFakeIpcChannel,
  type FakeIpcChannel,
} from '../ipc/fake-ipc-channel'
import {
  useImmediateUiFlush,
  wireAgentChatStreamListeners,
  type AgentStreamListenerStore,
  type StoreMessage,
} from './wire-agent-stream-listeners'
import { flushPromises } from './mount-app'
import { flushStoreStreamSync } from '@renderer/views/agent-chat/perf/storeStreamSync'

const CONVERSATION_ID = 'conv-wire'
const ASSISTANT_ID = 'assistant-wire'

function createStore(
  overrides: Partial<AgentStreamListenerStore> = {},
): AgentStreamListenerStore {
  const conversations: Record<string, StoreMessage[]> = {
    [CONVERSATION_ID]: [
      { id: 'user-1', role: 'user', content: 'Hi' },
      {
        id: ASSISTANT_ID,
        role: 'assistant',
        content: '',
        isStreaming: true,
      },
    ],
  }

  return {
    conversations,
    getVisibleConversationId: () => CONVERSATION_ID,
    markAssistantMessageFinished: (conversationId, assistantId) => {
      const row = conversations[conversationId]?.find((m) => m.id === assistantId)
      if (row) row.isStreaming = false
    },
    ...overrides,
  }
}

describe('wireAgentChatStreamListeners', () => {
  let ipc: FakeIpcChannel
  let store: AgentStreamListenerStore
  let teardownListeners: (() => void) | null = null
  let teardownFlush: (() => void) | null = null

  beforeEach(() => {
    ipc = installFakeIpcChannel(createFakeIpcChannel())
    store = createStore()
    teardownFlush = useImmediateUiFlush()
    teardownListeners = wireAgentChatStreamListeners(ipc, store)
  })

  afterEach(() => {
    teardownListeners?.()
    teardownFlush?.()
    teardownListeners = null
    teardownFlush = null
  })

  it('applies legacy AgentStreamChunk strings', async () => {
    ipc.emit('AgentStreamChunk', {
      conversationId: CONVERSATION_ID,
      assistantId: ASSISTANT_ID,
      chunk: 'Hello',
    })
    flushStoreStreamSync()
    await flushPromises()

    expect(store.conversations[CONVERSATION_ID][1].content).toBe('Hello')
  })

  it('applies UI text-delta chunks', async () => {
    ipc.emit('AgentUIMessageChunk', {
      conversationId: CONVERSATION_ID,
      assistantId: ASSISTANT_ID,
      chunk: { type: 'text-delta', delta: 'World' },
    })
    flushStoreStreamSync()
    await flushPromises()

    expect(store.conversations[CONVERSATION_ID][1].content).toBe('World')
  })

  it('applies live step progress chunks', async () => {
    ipc.emit('AgentUIMessageChunk', {
      conversationId: CONVERSATION_ID,
      assistantId: ASSISTANT_ID,
      chunk: {
        type: 'data-agent-step-progress',
        data: { content: 'Searching files…' },
      },
    })
    flushStoreStreamSync()
    await flushPromises()

    expect(store.conversations[CONVERSATION_ID][1].content).toBe('Searching files…')
  })

  it('ignores chunks for unknown conversations', async () => {
    ipc.emit('AgentUIMessageChunk', {
      conversationId: 'missing',
      assistantId: ASSISTANT_ID,
      chunk: { type: 'text-delta', delta: 'Nope' },
    })
    flushStoreStreamSync()
    await flushPromises()

    expect(store.conversations[CONVERSATION_ID][1].content).toBe('')
  })

  it('marks assistant finished on AgentStreamFinished', async () => {
    ipc.emit('AgentUIMessageChunk', {
      conversationId: CONVERSATION_ID,
      assistantId: ASSISTANT_ID,
      chunk: { type: 'text-delta', delta: 'Done' },
    })
    ipc.emit('AgentStreamFinished', {
      conversationId: CONVERSATION_ID,
      assistantId: ASSISTANT_ID,
    })
    await flushPromises()

    const assistant = store.conversations[CONVERSATION_ID][1]
    expect(assistant.content).toContain('Done')
    expect(assistant.isStreaming).toBe(false)
  })
})
