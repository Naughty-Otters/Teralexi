/**
 * Integration tests: external channel path (Telegram, Slack, …) → engine → agent pipeline.
 *
 * Channels call {@link runAgentForConversation} without `uiMessages`; user text is loaded
 * from the conversation store. Verifies the event-driven LLM migration did not break that
 * contract (history replay, eventBus wiring, HITL pause semantics, bridge reply send).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AgentResponseOpts } from '@main/agent/types'

const CHANNEL_CONVERSATION_ID = 'channel:telegram:user-42'
const CHANNEL_AGENT_ID = 'skill:demo'

type StoredMessage = {
  id: string
  conversationId: string
  agentId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

const {
  streamAgentResponseMock,
  notifyFinishedMock,
  saveMessageMock,
  sendToTargetMock,
  conversationMessages,
  conversations,
  capturedStreamOpts,
} = vi.hoisted(() => {
  const conversationMessages: StoredMessage[] = []
  const conversations = new Map<
    string,
    { id: string; agentId: string; title: string; createdAt: string; updatedAt: string }
  >()
  const capturedStreamOpts: { current: AgentResponseOpts | null } = { current: null }

  return {
    streamAgentResponseMock: vi.fn(async (opts: AgentResponseOpts) => {
      capturedStreamOpts.current = opts
      return {
        structuredContent: 'Hello from the agent pipeline.',
        shouldPersistMemory: false,
        hitlPaused: false,
      }
    }),
    notifyFinishedMock: vi.fn(),
    saveMessageMock: vi.fn((msg: StoredMessage) => {
      conversationMessages.push(msg)
    }),
    sendToTargetMock: vi.fn(async () => undefined),
    conversationMessages,
    conversations,
    capturedStreamOpts,
  }
})

vi.mock('@main/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  }),
  instrumentObjectMethods: <T>(o: T) => o,
  instrumentInstanceMethods: <T>(o: T) => o,
  traceFunction: (_l: unknown, _n: string, fn: (...a: unknown[]) => unknown) => fn,
}))

vi.mock('@logging', () => ({
  runWithAgentRunLog: (_ctx: unknown, fn: () => unknown) => fn(),
}))

vi.mock('@config/system-prop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@config/system-prop')>()
  return {
    ...actual,
    getSystemPropValues: vi.fn(() => ({
      'settings.ollama.baseUrl': 'http://localhost:11434/',
      'settings.openai.baseUrl': 'https://api.openai.com/v1/',
    })),
  }
})

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    getConversation: (id: string) => conversations.get(id) ?? null,
    createConversation: (conv: {
      id: string
      agentId: string
      title: string
      createdAt: string
      updatedAt: string
    }) => {
      conversations.set(conv.id, conv)
    },
    getMessages: (conversationId: string) =>
      conversationMessages.filter((m) => m.conversationId === conversationId),
    saveMessage: saveMessageMock,
    listMcpServers: vi.fn(() => []),
    getMessageAttachmentsForMessage: vi.fn(() => []),
    upsertConversationSandboxRun: vi.fn(),
    insertTokenUsage: vi.fn(),
    applyCompactionToConversation: vi.fn(),
  })),
}))

vi.mock('@main/services/conversation-store-notify', () => ({
  notifyConversationStoreChanged: vi.fn(),
}))

vi.mock('@main/services/web-content-send', () => ({
  webContentSend: {
    AgentStreamChunk: vi.fn(),
    AgentUIMessageChunk: vi.fn(),
    AgentStreamFinished: vi.fn(),
    AgentSandboxOutput: vi.fn(),
    ConversationStoreChanged: vi.fn(),
  },
}))

vi.mock('@main/services/mcp-server-manager', () => ({
  getMcpServerManager: vi.fn(() => ({
    listTools: vi.fn(async () => []),
  })),
}))

vi.mock('@main/workflows/workflow-dispatcher', () => ({
  getWorkflowDispatcher: vi.fn(() => ({
    tryDispatchChannelMessage: vi.fn(async () => ({ dispatched: false })),
  })),
}))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}))

vi.mock('@main/agent/flow', () => ({
  streamAgentResponse: (...args: unknown[]) => streamAgentResponseMock(...args),
}))

vi.mock('@main/agent/hooks/user-hooks', () => ({
  runUserHooks: vi.fn(async () => ({ blocked: false })),
  loadUserHooksConfig: vi.fn(() => ({ hooks: [] })),
  clearUserHooksCache: vi.fn(),
}))

vi.mock('@main/agent/compaction', () => ({
  autoCompactStoredConversationIfNeeded: vi.fn(async () => ({ compacted: false })),
}))

vi.mock('@main/services/chat-attachments', () => ({
  ensureUserAttachmentsUploadedBeforeAgentRun: vi.fn(async () => ({
    attachments: [],
  })),
  resolveUserAttachmentsForTurn: vi.fn(async () => ({ attachments: [] })),
}))

vi.mock('@main/agent/memory', () => ({
  enqueueAgentMemoryExchange: vi.fn(),
}))

vi.mock('@main/agent/providers/context', () => ({
  ProviderContext: {
    createModel: vi.fn(() => ({})),
    createModelForOpts: vi.fn(() => ({})),
  },
}))

vi.mock('@main/channels/framework/channel-registry', () => ({
  getChannelRegistry: vi.fn(() => ({
    get: vi.fn(() => ({ sendToTarget: sendToTargetMock })),
  })),
}))

const mockEngineAgent = {
  id: CHANNEL_AGENT_ID,
  name: 'Demo',
  description: '',
  model: 'test-model',
  systemPrompt: 'You are helpful.',
  provider: 'ollama' as const,
  isSkill: true,
  skillId: 'demo',
  availableSkillTools: [],
  availableSet: [],
  availableSetTouched: false,
  toolNeedsApprovalOverrides: {},
}

vi.mock('@main/agent/config/context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@main/agent/config/context')>()
  return {
    ...actual,
    ConfigContext: class extends actual.ConfigContext {
      static loadEngineAgents = vi.fn(async () => [mockEngineAgent])
    },
  }
})

/** Patch stream bridge mock to capture notifyFinished while keeping real chunk handlers. */
vi.mock('@main/agent/agent-stream-bridge', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@main/agent/agent-stream-bridge')>()
  return {
    ...actual,
    createAgentStreamBridge: vi.fn((args) => {
      const bridge = actual.createAgentStreamBridge(args)
      return {
        ...bridge,
        notifyFinished: (...notifyArgs: unknown[]) => {
          notifyFinishedMock(...notifyArgs)
          return bridge.notifyFinished()
        },
      }
    }),
  }
})

import { runAgentForConversation } from '@main/engine'
import { getChannelConversationBridge } from './conversation-bridge'

function seedChannelConversation(userText: string): {
  conversationId: string
  assistantMessageId: string
} {
  conversationMessages.length = 0
  conversations.clear()
  capturedStreamOpts.current = null

  const now = '2026-03-20T12:00:00.000Z'
  conversations.set(CHANNEL_CONVERSATION_ID, {
    id: CHANNEL_CONVERSATION_ID,
    agentId: CHANNEL_AGENT_ID,
    title: 'telegram: Hello channel',
    createdAt: now,
    updatedAt: now,
  })

  const userMessageId = 'u-channel-1'
  conversationMessages.push({
    id: userMessageId,
    conversationId: CHANNEL_CONVERSATION_ID,
    agentId: CHANNEL_AGENT_ID,
    role: 'user',
    content: userText,
    createdAt: now,
  })

  return {
    conversationId: CHANNEL_CONVERSATION_ID,
    assistantMessageId: 'a-channel-1',
  }
}

describe('channel → engine integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    conversationMessages.length = 0
    conversations.clear()
    capturedStreamOpts.current = null
    streamAgentResponseMock.mockImplementation(async (opts: AgentResponseOpts) => {
      capturedStreamOpts.current = opts
      return {
        structuredContent: 'Hello from the agent pipeline.',
        shouldPersistMemory: false,
        hitlPaused: false,
      }
    })
  })

  it('runAgentForConversation passes multi-turn store history in opts.messages', async () => {
    const now = '2026-03-20T12:00:00.000Z'
    conversations.set(CHANNEL_CONVERSATION_ID, {
      id: CHANNEL_CONVERSATION_ID,
      agentId: CHANNEL_AGENT_ID,
      title: 'telegram: thread',
      createdAt: now,
      updatedAt: now,
    })

    conversationMessages.push(
      {
        id: 'u-1',
        conversationId: CHANNEL_CONVERSATION_ID,
        agentId: CHANNEL_AGENT_ID,
        role: 'user',
        content: 'First question',
        createdAt: now,
      },
      {
        id: 'a-1',
        conversationId: CHANNEL_CONVERSATION_ID,
        agentId: CHANNEL_AGENT_ID,
        role: 'assistant',
        content: 'First answer',
        createdAt: now,
      },
      {
        id: 'u-2',
        conversationId: CHANNEL_CONVERSATION_ID,
        agentId: CHANNEL_AGENT_ID,
        role: 'user',
        content: 'Follow-up question',
        createdAt: now,
      },
    )

    const assistantMessageId = 'a-channel-2'
    await runAgentForConversation({
      conversationId: CHANNEL_CONVERSATION_ID,
      agentId: CHANNEL_AGENT_ID,
      assistantMessageId,
      userId: 'default',
    })

    expect(streamAgentResponseMock).toHaveBeenCalledTimes(1)
    const opts = capturedStreamOpts.current
    expect(opts).not.toBeNull()
    expect(opts!.messages.length).toBeGreaterThan(1)
    expect(opts!.messages.map((m) => m.content)).toEqual([
      'First question',
      'First answer',
      'Follow-up question',
    ])
  })

  it('runAgentForConversation loads store history without uiMessages (channel-style)', async () => {
    const { conversationId, assistantMessageId } = seedChannelConversation(
      'Message from Telegram',
    )

    const result = await runAgentForConversation({
      conversationId,
      agentId: CHANNEL_AGENT_ID,
      assistantMessageId,
      userId: 'default',
      // No uiMessages, no pendingUserMessage — same as conversation-bridge.
    })

    expect(result.hasError).toBe(false)
    expect(result.finalContent).toBe('Hello from the agent pipeline.')
    expect(streamAgentResponseMock).toHaveBeenCalledTimes(1)

    const opts = capturedStreamOpts.current!
    expect(opts.clientUiMessages).toBeUndefined()
    expect(opts.messages).toEqual([
      { role: 'user', content: 'Message from Telegram' },
    ])
    expect(opts.conversationId).toBe(conversationId)
    expect(opts.assistantMessageId).toBe(assistantMessageId)
  })

  it('wires eventBus into streamAgentResponse opts (event-driven migration)', async () => {
    const { conversationId, assistantMessageId } = seedChannelConversation('Ping')

    await runAgentForConversation({
      conversationId,
      agentId: CHANNEL_AGENT_ID,
      assistantMessageId,
      userId: 'default',
    })

    const opts = capturedStreamOpts.current!
    expect(opts.eventBus).toBeDefined()
    expect(typeof opts.eventBus?.publish).toBe('function')
    expect(typeof opts.eventBus?.subscribe).toBe('function')
  })

  it('notifies stream finished on successful channel run without webContents', async () => {
    const { conversationId, assistantMessageId } = seedChannelConversation('Hi')

    await runAgentForConversation({
      conversationId,
      agentId: CHANNEL_AGENT_ID,
      assistantMessageId,
      userId: 'default',
    })

    expect(notifyFinishedMock).toHaveBeenCalledTimes(1)
  })

  it('does not notify stream finished when pipeline pauses for HITL', async () => {
    streamAgentResponseMock.mockResolvedValueOnce({
      structuredContent: '{"version":2}',
      shouldPersistMemory: false,
      hitlPaused: true,
    })

    const { conversationId, assistantMessageId } = seedChannelConversation('Tool me')

    const result = await runAgentForConversation({
      conversationId,
      agentId: CHANNEL_AGENT_ID,
      assistantMessageId,
      userId: 'default',
    })

    expect(result.hitlPaused).toBe(true)
    expect(notifyFinishedMock).not.toHaveBeenCalled()
  })

  it('persists assistant reply to store after successful channel run', async () => {
    const { conversationId, assistantMessageId } = seedChannelConversation('Question')

    await runAgentForConversation({
      conversationId,
      agentId: CHANNEL_AGENT_ID,
      assistantMessageId,
      userId: 'default',
    })

    expect(saveMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: assistantMessageId,
        conversationId,
        role: 'assistant',
        content: 'Hello from the agent pipeline.',
      }),
    )
  })
})

describe('channel bridge integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    conversationMessages.length = 0
    conversations.clear()
    streamAgentResponseMock.mockImplementation(async (opts: AgentResponseOpts) => {
      capturedStreamOpts.current = opts
      return {
        structuredContent: 'Reply for Telegram user.',
        shouldPersistMemory: false,
        hitlPaused: false,
      }
    })
  })

  it('onIncomingMessage saves user text, runs agent, and sends channel reply', async () => {
    const bridge = getChannelConversationBridge()

    bridge.onIncomingMessage({
      channelId: 'telegram',
      senderId: 'user-42',
      senderTarget: 'chat-99',
      text: 'Hello from Telegram',
      occurredAtIso: '2026-03-20T12:00:00.000Z',
      agentId: CHANNEL_AGENT_ID,
    })

    // Bridge fires runAgentAndReply without awaiting; flush microtasks.
    await vi.waitFor(() => {
      expect(streamAgentResponseMock).toHaveBeenCalledTimes(1)
    })

    await vi.waitFor(() => {
      expect(sendToTargetMock).toHaveBeenCalledTimes(1)
    })

    expect(sendToTargetMock).toHaveBeenCalledWith(
      'chat-99',
      'Reply for Telegram user.',
    )

    expect(conversationMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId: CHANNEL_CONVERSATION_ID,
          role: 'user',
          content: 'Hello from Telegram',
        }),
        expect.objectContaining({
          conversationId: CHANNEL_CONVERSATION_ID,
          role: 'assistant',
          content: 'Reply for Telegram user.',
        }),
      ]),
    )

    const opts = capturedStreamOpts.current!
    expect(opts.clientUiMessages).toBeUndefined()
    expect(opts.messages).toEqual([
      { role: 'user', content: 'Hello from Telegram' },
    ])
  })

  it('does not send channel reply when agent returns empty content on HITL pause', async () => {
    streamAgentResponseMock.mockResolvedValueOnce({
      structuredContent: '',
      shouldPersistMemory: false,
      hitlPaused: true,
    })

    const bridge = getChannelConversationBridge()
    bridge.onIncomingMessage({
      channelId: 'slack',
      senderId: 'user-7',
      senderTarget: 'C123',
      text: 'Run tool',
      occurredAtIso: '2026-03-20T12:01:00.000Z',
      agentId: CHANNEL_AGENT_ID,
    })

    await vi.waitFor(() => {
      expect(streamAgentResponseMock).toHaveBeenCalledTimes(1)
    })

    // Allow runAgentAndReply to settle.
    await new Promise((r) => setTimeout(r, 20))

    expect(sendToTargetMock).not.toHaveBeenCalled()
  })

  it('recreates the same channel session id after the conversation row is deleted', async () => {
    streamAgentResponseMock.mockResolvedValueOnce({
      structuredContent: 'First reply',
      shouldPersistMemory: false,
      hitlPaused: false,
    })
    streamAgentResponseMock.mockResolvedValueOnce({
      structuredContent: 'Second reply',
      shouldPersistMemory: false,
      hitlPaused: false,
    })

    const bridge = getChannelConversationBridge()
    const channelId = 'telegram'
    const senderId = 'user-recreate'
    const sessionId = `channel:${channelId}:${senderId}`

    bridge.onIncomingMessage({
      channelId,
      senderId,
      senderTarget: 'chat-recreate',
      text: 'First message',
      occurredAtIso: '2026-03-20T12:00:00.000Z',
      agentId: CHANNEL_AGENT_ID,
    })

    await vi.waitFor(() => {
      expect(conversations.has(sessionId)).toBe(true)
    })

    conversations.delete(sessionId)
    conversationMessages.length = 0
    streamAgentResponseMock.mockClear()
    sendToTargetMock.mockClear()

    bridge.onIncomingMessage({
      channelId,
      senderId,
      senderTarget: 'chat-recreate',
      text: 'Second message',
      occurredAtIso: '2026-03-20T12:05:00.000Z',
      agentId: CHANNEL_AGENT_ID,
    })

    await vi.waitFor(() => {
      expect(conversations.has(sessionId)).toBe(true)
    })

    expect(
      conversationMessages.filter(
        (message) =>
          message.conversationId === sessionId && message.role === 'user',
      ),
    ).toEqual([
      expect.objectContaining({ content: 'Second message' }),
    ])
  })
})
