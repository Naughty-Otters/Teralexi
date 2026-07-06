import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import type { UIMessage } from '@teralexi-ai'
import { IpcAgentChatTransport } from '@renderer/views/agent-chat/IpcAgentChatTransport'
import {
  createAgentStreamDriver,
  type AgentStreamDriver,
} from '@test/ipc/agent-stream-driver'
import {
  createFakeIpcChannel,
  installFakeIpcChannel,
  type FakeIpcChannel,
} from '@test/ipc/fake-ipc-channel'
import { textStartChunk } from '@test/ipc/stream-fixtures'
import {
  useImmediateUiFlush,
  wireAgentChatStreamListeners,
  type AgentStreamListenerStore,
  type StoreMessage,
} from '@test/renderer/wire-agent-stream-listeners'
import { flushPromises } from '@test/renderer/mount-app'
import { flushStoreStreamSync } from '@renderer/views/agent-chat/perf/storeStreamSync'

const CONVERSATION_ID = 'conv-stream'
const ASSISTANT_ID = 'assistant-stream-1'

function createInitialStore(
  overrides: Partial<AgentStreamListenerStore> = {},
): AgentStreamListenerStore {
  const conversations: Record<string, StoreMessage[]> = {
    [CONVERSATION_ID]: [
      { id: 'user-1', role: 'user', content: 'Hello' },
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

async function readStreamText(
  stream: ReadableStream<unknown>,
): Promise<string> {
  const reader = stream.getReader()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = value as { type?: string; delta?: string }
    if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
      text += chunk.delta
    }
  }
  return text
}

describe('chat stream reactions (UI integration)', () => {
  let ipc: FakeIpcChannel
  let driver: AgentStreamDriver
  let store: AgentStreamListenerStore
  let teardownListeners: (() => void) | null = null
  let teardownFlush: (() => void) | null = null

  beforeEach(() => {
    ipc = installFakeIpcChannel(createFakeIpcChannel())
    store = createInitialStore()
    driver = createAgentStreamDriver(ipc, {
      conversationId: CONVERSATION_ID,
      assistantId: ASSISTANT_ID,
    })
    teardownFlush = useImmediateUiFlush()
    teardownListeners = wireAgentChatStreamListeners(ipc, store)
  })

  afterEach(() => {
    teardownListeners?.()
    teardownFlush?.()
    teardownListeners = null
    teardownFlush = null
  })

  it('applies UI message text deltas to the Pinia-backed store', async () => {
    driver.pushTextDelta('Hello ')
    driver.pushTextDelta('world')
    flushStoreStreamSync()
    await flushPromises()

    expect(store.conversations[CONVERSATION_ID][1].content).toBe('Hello world')
  })

  it('marks the assistant row finished after AgentStreamFinished', async () => {
    driver.pushTextDelta('Done.')
    driver.finish()
    await flushPromises()

    const assistant = store.conversations[CONVERSATION_ID][1]
    expect(assistant.content).toContain('Done.')
    expect(assistant.isStreaming).toBe(false)
  })

  it('syncs background conversation store updates while another conversation is visible', async () => {
    const backgroundId = 'conv-background'
    const backgroundAssistantId = 'assistant-bg-1'
    store = createInitialStore({
      conversations: {
        [CONVERSATION_ID]: [
          { id: 'user-1', role: 'user', content: 'Visible' },
          {
            id: ASSISTANT_ID,
            role: 'assistant',
            content: '',
            isStreaming: true,
          },
        ],
        [backgroundId]: [
          { id: 'user-bg', role: 'user', content: 'Background' },
          {
            id: backgroundAssistantId,
            role: 'assistant',
            content: '',
            isStreaming: true,
          },
        ],
      },
      getVisibleConversationId: () => CONVERSATION_ID,
      markAssistantMessageFinished: vi.fn(),
    })
    teardownListeners?.()
    teardownListeners = wireAgentChatStreamListeners(ipc, store)

    const backgroundDriver = createAgentStreamDriver(ipc, {
      conversationId: backgroundId,
      assistantId: backgroundAssistantId,
    })
    backgroundDriver.pushTextDelta('Background update')
    await flushPromises()

    expect(store.conversations[backgroundId][1].content).toBe('Background update')
    expect(store.conversations[CONVERSATION_ID][1].content).toBe('')
  })

  it('streams text through IpcAgentChatTransport when IPC chunks arrive', async () => {
    let releaseRun: (() => void) | null = null
    let capturedAssistantId = ''
    const runGate = new Promise<void>((resolve) => {
      releaseRun = resolve
    })

    ipc.setInvokeHandler('RunAgentForConversation', async (args) => {
      const payload = args as { assistantMessageId?: string }
      capturedAssistantId = payload.assistantMessageId?.trim() ?? ''
      await runGate
      return {
        finalContent: 'Final from main',
        hasError: false,
        hitlPaused: false,
      }
    })

    const transport = new IpcAgentChatTransport({
      getRunContext: () => ({
        conversationId: CONVERSATION_ID,
        agentId: 'skill:demo',
        userId: 'user-1',
      }),
      persistUserMessage: vi.fn(),
    })

    const messages: UIMessage[] = [
      { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
    ]

    const streamPromise = transport.sendMessages({
      chatId: CONVERSATION_ID,
      trigger: 'submit-message',
      messageId: ASSISTANT_ID,
      messages,
      abortSignal: new AbortController().signal,
    } as never)

    await flushPromises()
    expect(capturedAssistantId).not.toBe('')

    const streamDriver = createAgentStreamDriver(ipc, {
      conversationId: CONVERSATION_ID,
      assistantId: capturedAssistantId,
    })
    streamDriver.pushUiChunk(
      textStartChunk({
        conversationId: CONVERSATION_ID,
        assistantId: capturedAssistantId,
      }),
    )
    streamDriver.pushTextDelta('Streaming ')
    streamDriver.pushTextDelta('response')
    releaseRun?.()
    streamDriver.finish()

    const stream = await streamPromise
    const text = await readStreamText(stream)
    expect(text).toContain('Streaming response')
  })
})
