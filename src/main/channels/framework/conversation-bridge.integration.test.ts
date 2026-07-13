/**
 * Channel → engine contract tests.
 *
 * Fully hermetic: never importOriginal heavy agent modules. On Windows CI,
 * importOriginal('@main/agent/utils'|config/context) pulls skills/MCP/native
 * addons and hangs past Vitest's timeout on the first test.
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
  mockEngineAgent,
  loadEngineAgentsMock,
} = vi.hoisted(() => {
  const conversationMessages: StoredMessage[] = []
  const conversations = new Map<
    string,
    { id: string; agentId: string; title: string; createdAt: string; updatedAt: string }
  >()
  const capturedStreamOpts: { current: AgentResponseOpts | null } = { current: null }
  const mockEngineAgent = {
    id: 'skill:demo',
    name: 'Demo',
    description: '',
    model: 'test-model',
    systemPrompt: 'You are helpful.',
    provider: 'ollama' as const,
    isSkill: true,
    skillId: 'demo',
    availableSkillTools: [] as unknown[],
    availableSet: [] as unknown[],
    availableSetTouched: false,
    toolNeedsApprovalOverrides: {} as Record<string, boolean>,
  }
  const loadEngineAgentsMock = vi.fn(async () => [mockEngineAgent])

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
    mockEngineAgent,
    loadEngineAgentsMock,
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

vi.mock('@config/system-prop', () => ({
  getSystemPropValues: vi.fn(() => ({})),
  getSystemPropValue: vi.fn(() => undefined),
  setSystemPropValue: vi.fn(),
  isValidSystemPropKey: () => true,
}))

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
    listAgentConfigurations: vi.fn(() => []),
    getConversationSettings: vi.fn(() => null),
    getConversationHooks: vi.fn(() => ({ hooks: [] })),
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
  streamAgentResponse: streamAgentResponseMock,
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

vi.mock('@main/agent/providers/stage-model-registry', () => ({
  StageModelRegistry: class StageModelRegistry {},
}))

vi.mock('@main/agent/run/agent-run', () => ({
  AgentRun: class AgentRun {},
}))

vi.mock('@main/agent/run/sub-flow-output-text', () => ({
  mergeSubFlowOutputText: (text: string) => text,
}))

vi.mock('@main/agent/workspace/conversation-workspace', () => ({
  getWorkspacePath: vi.fn(() => null),
}))

vi.mock('@main/agent/coding/plan-mode-session-reminders', () => ({
  clearPlanExecutionCompleted: vi.fn(),
}))

vi.mock('@main/agent/coding/plan-mode-state', () => ({
  isPlanModeActive: vi.fn(() => false),
}))

vi.mock('@main/agent/expr/thread-context-builder', () => ({
  resolveEffectiveThreadTag: vi.fn(() => 'general'),
  detectTopicSwitch: vi.fn(() => ({ switched: false })),
}))

vi.mock('@main/agent/llm/llm-debug-writer', () => ({
  createLlmDebugRunId: vi.fn(() => 'debug-run-1'),
}))

vi.mock('@main/agent/llm/log-llm-error', () => ({
  formatLlmErrorForUi: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
  llmErrorFields: () => ({}),
}))

vi.mock('@main/i18n/resolve-response-language', () => ({
  resolveResponseLanguageForAgent: vi.fn(() => 'English'),
}))

vi.mock('@main/agent/utils/chat-context-settings', () => ({
  loadChatContextWindowMessages: vi.fn(() => 200),
}))

vi.mock('@main/agent/bus/agent-event-bus', () => ({
  createAgentEventBus: vi.fn(() => ({
    publish: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  })),
}))

vi.mock('@main/agent/bus/ipc-projector', () => ({
  attachIpcProjector: vi.fn(() => () => undefined),
}))

/** Inline history loader — do not importOriginal the utils barrel (hangs on Win CI). */
vi.mock('@main/agent/utils', () => ({
  extractTrailingUserForPersistence: vi.fn(() => null),
  parseClientUiMessages: vi.fn(() => undefined),
  serializeAssistantMessageForExternalReply: (content: string) => content,
  serializeAssistantMessageForHistory: (content: string) => content,
  loadAgentRunCredentials: vi.fn(() => ({
    ollamaBaseURL: 'http://127.0.0.1:11434',
    llamacppBaseURL: 'http://127.0.0.1:8080/v1',
    llamacppApiKey: '',
    anthropicApiKey: '',
    anthropicBaseURL: '',
    openaiApiKey: '',
    openaiBaseURL: '',
    geminiApiKey: '',
    geminiBaseURL: '',
    deepseekApiKey: '',
    deepseekApiUrl: '',
    xaiApiKey: '',
    xaiBaseURL: '',
    zhipuApiKey: '',
    zhipuBaseURL: '',
    openAiCompatible: {},
  })),
  loadConversationHistory: (
    conversationId: string,
    assistantMessageId: string,
  ) =>
    conversationMessages
      .filter(
        (m) =>
          m.conversationId === conversationId && m.id !== assistantMessageId,
      )
      .map((m) => ({ role: m.role, content: m.content })),
  loadMcpToolsForAgent: vi.fn(async () => []),
  resolveEnabledSkillToolNames: vi.fn(() => undefined),
}))

vi.mock('@main/channels/framework/channel-registry', () => ({
  getChannelRegistry: vi.fn(() => ({
    get: vi.fn(() => ({ sendToTarget: sendToTargetMock })),
  })),
}))

vi.mock('@main/agent/config/context', () => {
  class ConfigContext {
    static ERRORS = { NOT_FOUND: 'Agent not found: {agentId}' }
    static ENGINE_LOG = {
      EXECUTION_ABORTED: 'aborted',
      PREPARED_CONTEXT: 'prepared',
      COMPLETED: 'completed',
      FAILED: 'failed',
      ABORTED: 'aborted-run',
      PERSIST_ASSISTANT_OK: 'persist-ok',
      PERSIST_ASSISTANT_FAIL: 'persist-fail',
      PERSIST_USER_OK: 'user-ok',
      PERSIST_USER_FAIL: 'user-fail',
      PERSIST_SANDBOX_FAIL: 'sandbox-fail',
      MEMORY_RECORD_ENQUEUED: 'memory-enqueued',
      MEMORY_RECORD_FAIL: 'memory-fail',
    }
    static DEFAULT_USER_ID = 'default'
    static DEFAULT_RESPONSE_LANGUAGE = 'English'
    static ANTHROPIC_MODELS: string[] = []
    static SYSTEM_PROP_KEYS: Record<string, string> = {}
    static DEFAULTS = {}
    static loadEngineAgents = loadEngineAgentsMock

    normalizeBaseURL(url: string, fallback: string): string {
      const raw = (url || fallback).trim() || fallback
      return raw.endsWith('/') ? raw : `${raw}/`
    }
  }
  return { ConfigContext, loadEngineAgents: loadEngineAgentsMock }
})

vi.mock('@main/agent/agent-stream-bridge', () => ({
  createAgentStreamBridge: vi.fn(() => ({
    onChunk: vi.fn(),
    onUIMessageChunk: vi.fn(),
    onStepProgress: vi.fn(),
    onSubAgentRunEvent: vi.fn(),
    onSandboxReady: vi.fn(),
    onSandboxResultWritten: vi.fn(),
    notifyFinished: notifyFinishedMock,
  })),
}))

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

  conversationMessages.push({
    id: 'u-channel-1',
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

function resetStreamMock() {
  streamAgentResponseMock.mockReset()
  streamAgentResponseMock.mockImplementation(async (opts: AgentResponseOpts) => {
    capturedStreamOpts.current = opts
    return {
      structuredContent: 'Hello from the agent pipeline.',
      shouldPersistMemory: false,
      hitlPaused: false,
    }
  })
  loadEngineAgentsMock.mockReset()
  loadEngineAgentsMock.mockResolvedValue([mockEngineAgent])
}

describe('channel → engine integration', () => {
  beforeEach(() => {
    conversationMessages.length = 0
    conversations.clear()
    capturedStreamOpts.current = null
    resetStreamMock()
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
    const result = await runAgentForConversation({
      conversationId: CHANNEL_CONVERSATION_ID,
      agentId: CHANNEL_AGENT_ID,
      assistantMessageId,
      userId: 'default',
    })

    expect(result.hasError).toBe(false)
    expect(loadEngineAgentsMock).toHaveBeenCalled()
    expect(streamAgentResponseMock).toHaveBeenCalledTimes(1)
    const opts = capturedStreamOpts.current
    expect(opts).not.toBeNull()
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
    conversationMessages.length = 0
    conversations.clear()
    capturedStreamOpts.current = null
    resetStreamMock()
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

    await vi.waitFor(() => {
      expect(streamAgentResponseMock).toHaveBeenCalledTimes(1)
    })

    await vi.waitFor(() => {
      expect(sendToTargetMock).toHaveBeenCalledTimes(1)
    })

    expect(sendToTargetMock).toHaveBeenCalledWith(
      'chat-99',
      'Hello from the agent pipeline.',
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
          content: 'Hello from the agent pipeline.',
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
    resetStreamMock()
    streamAgentResponseMock.mockResolvedValueOnce({
      structuredContent: 'Second reply',
      shouldPersistMemory: false,
      hitlPaused: false,
    })

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
