import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import type { UIMessage } from '@teralexi-ai'
import { IpcAgentChatTransport } from '@renderer/views/agent-chat/IpcAgentChatTransport'
import {
  createAgentStreamDriver,
} from '@test/ipc/agent-stream-driver'
import {
  createFakeIpcChannel,
  installFakeIpcChannel,
} from '@test/ipc/fake-ipc-channel'
import {
  collectFormRequestChunk,
  toolApprovalRequestChunk,
} from '@test/ipc/stream-fixtures'
import {
  conversationHitlBlocksQueue,
  setConversationHitlBlocksQueue,
} from '@renderer/views/agent-chat/conversation-chat-session'
import {
  mountCollectFormCard,
  mountToolApprovalCard,
  settleUi,
} from '@test/renderer/mount-chat-panel'
import { teardownAppHarness } from '@test/renderer/mount-app'
import { flushPromises } from '@test/renderer/mount-app'

const CONVERSATION_ID = 'conv-hitl'
const ASSISTANT_ID = 'assistant-hitl-1'

async function runHitlTransportUntilBlocked(options: {
  chunk: ReturnType<typeof toolApprovalRequestChunk>
  onHitlBlocksQueue: (conversationId: string, blocked: boolean) => void
}): Promise<void> {
  let releaseRun: (() => void) | null = null
  let capturedAssistantId = ''
  const runGate = new Promise<void>((resolve) => {
    releaseRun = resolve
  })

  const ipc = installFakeIpcChannel(createFakeIpcChannel())
  ipc.setInvokeHandler('RunAgentForConversation', async (args) => {
    const payload = args as { assistantMessageId?: string }
    capturedAssistantId = payload.assistantMessageId?.trim() ?? ''
    await runGate
    return {
      finalContent: '',
      hasError: false,
      hitlPaused: true,
    }
  })

  const transport = new IpcAgentChatTransport({
    getRunContext: () => ({
      conversationId: CONVERSATION_ID,
      agentId: 'skill:demo',
      userId: 'user-1',
    }),
    persistUserMessage: vi.fn(),
    onHitlBlocksQueue: options.onHitlBlocksQueue,
  })

  const messages: UIMessage[] = [
    { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'HITL' }] },
  ]

  const streamPromise = transport.sendMessages({
    chatId: CONVERSATION_ID,
    trigger: 'submit-message',
    messageId: ASSISTANT_ID,
    messages,
    abortSignal: new AbortController().signal,
  } as never)

  await flushPromises()
  const driver = createAgentStreamDriver(ipc, {
    conversationId: CONVERSATION_ID,
    assistantId: capturedAssistantId,
  })
  driver.pushUiChunk({
    ...options.chunk,
    assistantId: capturedAssistantId,
  })
  await flushPromises()

  releaseRun?.()
  const stream = await streamPromise
  const reader = stream.getReader()
  while (true) {
    const { done } = await reader.read()
    if (done) break
  }
}

describe('chat HITL reactions (UI integration)', () => {
  beforeEach(() => {
    setConversationHitlBlocksQueue(CONVERSATION_ID, false)
  })

  afterEach(() => {
    setConversationHitlBlocksQueue(CONVERSATION_ID, false)
    teardownAppHarness()
  })

  it('blocks the message queue when a tool approval chunk arrives', async () => {
    const onHitlBlocksQueue = vi.fn((conversationId, blocked) => {
      setConversationHitlBlocksQueue(conversationId, blocked)
    })

    await runHitlTransportUntilBlocked({
      onHitlBlocksQueue,
      chunk: toolApprovalRequestChunk({
        conversationId: CONVERSATION_ID,
        assistantId: ASSISTANT_ID,
      }),
    })

    expect(onHitlBlocksQueue).toHaveBeenCalledWith(CONVERSATION_ID, true)
    expect(conversationHitlBlocksQueue(CONVERSATION_ID)).toBe(true)
  })

  it('blocks the message queue when a collect-form chunk arrives', async () => {
    const onHitlBlocksQueue = vi.fn((conversationId, blocked) => {
      setConversationHitlBlocksQueue(conversationId, blocked)
    })

    await runHitlTransportUntilBlocked({
      onHitlBlocksQueue,
      chunk: collectFormRequestChunk({
        conversationId: CONVERSATION_ID,
        assistantId: ASSISTANT_ID,
      }),
    })

    expect(onHitlBlocksQueue).toHaveBeenCalledWith(CONVERSATION_ID, true)
    expect(conversationHitlBlocksQueue(CONVERSATION_ID)).toBe(true)
  })

  it('renders collect-form fields in the chat UI', async () => {
    const { wrapper } = mountCollectFormCard()
    await settleUi()

    expect(wrapper.find('.hitl-form-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('Additional information required')
    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('.hitl-form-actions').exists()).toBe(true)
  })

  it('renders tool approval UI for a pending tool call', async () => {
    const { wrapper } = mountToolApprovalCard()
    await settleUi()

    expect(wrapper.find('.ta').exists()).toBe(true)
    expect(wrapper.text()).toContain('Tool approval')
    expect(wrapper.text()).toContain('read_file')
  })
})
