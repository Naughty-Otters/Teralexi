import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  streamAgentResponseMock,
  notifyFinishedMock,
  conversationStoreChangedMock,
  notifyConversationStoreChangedMock,
  ensureUserAttachmentsUploadedBeforeAgentRunMock,
  loadConversationHistoryMock,
  getConversationLlmOverrideMock,
} =
  vi.hoisted(() => ({
    streamAgentResponseMock: vi.fn(async () => ({
      structuredContent: 'done',
      shouldPersistMemory: true,
      hitlPaused: false,
    })),
    notifyFinishedMock: vi.fn(),
    conversationStoreChangedMock: vi.fn(),
    notifyConversationStoreChangedMock: vi.fn(),
    ensureUserAttachmentsUploadedBeforeAgentRunMock: vi.fn(async () => ({
      attachments: [],
    })),
    loadConversationHistoryMock: vi.fn(() => []),
    getConversationLlmOverrideMock: vi.fn(() => null),
  }))

vi.mock('@main/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }),
  instrumentObjectMethods: <T>(o: T) => o,
  instrumentInstanceMethods: <T>(o: T) => o,
  traceFunction: (_l: unknown, _n: string, fn: (...a: unknown[]) => unknown) => fn,
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    saveMessage: vi.fn(),
    upsertConversationSandboxRun: vi.fn(),
    getMessageAttachmentsForMessage: vi.fn(() => []),
    getMessages: vi.fn(() => []),
    getConversationHooks: vi.fn(() => ({ hooks: [] })),
    getConversationLlmOverride: getConversationLlmOverrideMock,
  })),
}))

vi.mock('@main/services/web-content-send', () => ({
  webContentSend: {
    ConversationStoreChanged: conversationStoreChangedMock,
  },
}))

vi.mock('@main/services/conversation-store-notify', () => ({
  notifyConversationStoreChanged: notifyConversationStoreChangedMock,
}))

vi.mock('@main/agent/follow-up', () => ({
  clearFollowUpMeta: vi.fn(() => ({ ok: true, revision: 1 })),
}))

vi.mock('@main/agent/sandbox', () => ({
  resolveSandboxRootForConversation: vi.fn(() => '/tmp/fake-sandbox'),
  getOrCreateSandboxForConversation: vi.fn(),
  releaseConversationSandbox: vi.fn(),
  peekSandboxRootForConversation: vi.fn(() => null),
}))

vi.mock('@logging', () => ({
  runWithAgentRunLog: (_ctx: unknown, fn: () => unknown) => fn(),
}))

vi.mock('@main/services/chat-attachments', () => ({
  ensureUserAttachmentsUploadedBeforeAgentRun:
    ensureUserAttachmentsUploadedBeforeAgentRunMock,
  resolveUserAttachmentsForTurn: ensureUserAttachmentsUploadedBeforeAgentRunMock,
}))

vi.mock('@main/agent/flow', () => ({
  streamAgentResponse: streamAgentResponseMock,
}))

const { loadEngineAgentsMock } = vi.hoisted(() => ({
  loadEngineAgentsMock: vi.fn(async () => [] as unknown[]),
}))

const mockEngineAgent = {
  id: 'skill:demo',
  name: 'Demo',
  description: '',
  model: 'm',
  systemPrompt: 'sys',
  provider: 'ollama' as const,
  isSkill: true,
  skillId: 'demo',
  availableSkillTools: [],
  availableSet: [],
  availableSetTouched: false,
  toolNeedsApprovalOverrides: {},
  stageLlmSettings: {
    mode: 'unified' as const,
    default: {
      provider: 'ollama' as const,
      model: 'm',
      providerOptions: {
        ollama: { think: false },
      },
    },
  },
}

loadEngineAgentsMock.mockResolvedValue([mockEngineAgent])

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
      STOP_REQUESTED: 'stop-requested',
    }
    static DEFAULT_USER_ID = 'default'
    static DEFAULT_RESPONSE_LANGUAGE = 'English'
    static ANTHROPIC_MODELS: string[] = []
    static SYSTEM_PROP_KEYS: Record<string, string> = {}
    static DEFAULTS = {}
    static loadEngineAgents = loadEngineAgentsMock
  }
  return { ConfigContext, loadEngineAgents: loadEngineAgentsMock }
})

vi.mock('@main/agent/hooks/user-hooks', () => ({
  runUserHooks: vi.fn(async () => ({ blocked: false })),
}))

vi.mock('@main/agent/compaction', () => ({
  autoCompactStoredConversationIfNeeded: vi.fn(async () => ({ compacted: false })),
}))

vi.mock('@main/agent/expr/thread-context-builder', () => ({
  resolveEffectiveThreadTag: vi.fn(() => 'general'),
  detectTopicSwitch: vi.fn(() => ({ switched: false })),
}))

vi.mock('@main/agent/utils/chat-context-settings', () => ({
  loadChatContextWindowMessages: vi.fn(() => 200),
}))

vi.mock('@main/agent/coding/plan-mode-session-reminders', () => ({
  clearPlanExecutionCompleted: vi.fn(),
}))

vi.mock('@main/agent/coding/plan-mode-state', () => ({
  isPlanModeActive: vi.fn(() => false),
}))

vi.mock('@main/agent/workspace/conversation-workspace', () => ({
  getWorkspacePath: vi.fn(() => null),
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

vi.mock('@main/agent/bus/agent-event-bus', () => ({
  createAgentEventBus: vi.fn(() => ({
    publish: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  })),
}))

vi.mock('@main/agent/bus/ipc-projector', () => ({
  attachIpcProjector: vi.fn(() => () => undefined),
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

vi.mock('@main/agent/utils', () => ({
  extractTrailingUserForPersistence: vi.fn(() => null),
  parseClientUiMessages: vi.fn(() => []),
  loadAgentRunCredentials: vi.fn(() => ({
    ollamaBaseURL: 'http://localhost',
    llamacppBaseURL: 'http://127.0.0.1:8080/v1',
    llamacppApiKey: '',
    anthropicApiKey: '',
    openaiApiKey: '',
    openaiBaseURL: '',
    geminiApiKey: '',
    deepseekApiKey: '',
    xaiApiKey: '',
    xaiBaseURL: '',
    zhipuApiKey: '',
  })),
  loadConversationHistory: loadConversationHistoryMock,
  loadMcpToolsForAgent: vi.fn(async () => []),
  resolveEnabledSkillToolNames: vi.fn(() => []),
}))

vi.mock('@main/agent/agent-stream-bridge', () => ({
  createAgentStreamBridge: vi.fn(() => ({
    onChunk: vi.fn(),
    onUIMessageChunk: vi.fn(),
    onStepProgress: vi.fn(),
    onSubAgentRunEvent: vi.fn(),
    onSandboxReady: vi.fn(),
    onSandboxResultWritten: vi.fn(),
    finalize: vi.fn(),
    notifyFinished: notifyFinishedMock,
  })),
}))

vi.mock('@main/agent/memory', () => ({
  enqueueAgentMemoryExchange: vi.fn(),
}))

vi.mock('@main/agent/providers/context', () => ({
  ProviderContext: {
    createModel: vi.fn(() => ({})),
  },
}))

import { enqueueAgentMemoryExchange } from '@main/agent/memory'
import { runAgentForConversation, stopAgentForConversation } from './conversation'

describe('agent engine', () => {
  beforeEach(() => {
    getConversationLlmOverrideMock.mockReset()
    getConversationLlmOverrideMock.mockReturnValue(null)
    loadConversationHistoryMock.mockReset()
    loadConversationHistoryMock.mockReturnValue([])
    loadEngineAgentsMock.mockReset()
    loadEngineAgentsMock.mockResolvedValue([mockEngineAgent])
    streamAgentResponseMock.mockReset()
    streamAgentResponseMock.mockResolvedValue({
      structuredContent: 'done',
      shouldPersistMemory: true,
      hitlPaused: false,
    })
    notifyFinishedMock.mockReset()
  })

  it('stopAgentForConversation is safe when no controller', () => {
    expect(() => stopAgentForConversation('missing')).not.toThrow()
  })

  it('runAgentForConversation returns flow result', async () => {
    const result = await runAgentForConversation({
      conversationId: 'c1',
      agentId: 'skill:demo',
      assistantMessageId: 'a1',
      userId: 'default',
      pendingUserMessage: {
        id: 'u1',
        content: 'Hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })
    expect(result.finalContent).toBe('done')
    expect(result.hasError).toBe(false)
    expect(enqueueAgentMemoryExchange).toHaveBeenCalled()
  })

  it('passes multi-turn store history in opts.messages', async () => {
    loadConversationHistoryMock.mockReturnValueOnce([
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Follow-up question' },
    ])
    streamAgentResponseMock.mockResolvedValueOnce({
      structuredContent: 'done',
      shouldPersistMemory: false,
      hitlPaused: false,
    })

    await runAgentForConversation({
      conversationId: 'c-multi',
      agentId: 'skill:demo',
      assistantMessageId: 'a-multi',
      userId: 'default',
    })

    expect(streamAgentResponseMock).toHaveBeenCalled()
    const opts = streamAgentResponseMock.mock.calls.at(-1)?.[0] as {
      messages: Array<{ role: string; content: string }>
    }
    expect(opts.messages.map((m) => m.content)).toEqual([
      'First question',
      'First answer',
      'Follow-up question',
    ])
  })

  it('forwards attachment source paths to attachment ingest', async () => {
    ensureUserAttachmentsUploadedBeforeAgentRunMock.mockClear()
    await runAgentForConversation({
      conversationId: 'c1',
      agentId: 'skill:demo',
      assistantMessageId: 'a1',
      userId: 'default',
      pendingUserMessage: {
        id: 'u1',
        content: 'Attached 1 file',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      attachmentSourcePaths: ['/tmp/report.pdf'],
    })
    expect(ensureUserAttachmentsUploadedBeforeAgentRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'c1',
        messageId: 'u1',
        attachmentSourcePaths: ['/tmp/report.pdf'],
      }),
    )
    expect(streamAgentResponseMock).toHaveBeenCalled()
    const uploadOrder =
      ensureUserAttachmentsUploadedBeforeAgentRunMock.mock.invocationCallOrder[0]
    const agentOrder = streamAgentResponseMock.mock.invocationCallOrder[0]
    expect(uploadOrder).toBeLessThan(agentOrder)
  })

  it('does not notify stream finished when pipeline paused for HITL', async () => {
    const { clearFollowUpMeta } = await import('@main/agent/follow-up')
    vi.mocked(clearFollowUpMeta).mockClear()
    vi.mocked(streamAgentResponseMock).mockResolvedValueOnce({
      structuredContent: '{"version":2}',
      shouldPersistMemory: false,
      hitlPaused: true,
    })
    notifyFinishedMock.mockClear()
    const result = await runAgentForConversation({
      conversationId: 'c-hitl',
      agentId: 'skill:demo',
      assistantMessageId: 'a-hitl',
      userId: 'default',
      pendingUserMessage: {
        id: 'u-hitl',
        content: 'Hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })
    expect(result.hitlPaused).toBe(true)
    expect(notifyFinishedMock).not.toHaveBeenCalled()
    // Turn start enableWrites + HITL pause disableWrites
    expect(clearFollowUpMeta).toHaveBeenCalledWith(
      '/tmp/fake-sandbox',
      'c-hitl',
      { enableWrites: false },
    )
  })

  it('skips memory enqueue when shouldPersistMemory is false', async () => {
    vi.mocked(streamAgentResponseMock).mockResolvedValueOnce({
      structuredContent: 'done',
      shouldPersistMemory: false,
      hitlPaused: false,
    })
    vi.mocked(enqueueAgentMemoryExchange).mockClear()
    await runAgentForConversation({
      conversationId: 'c2',
      agentId: 'skill:demo',
      assistantMessageId: 'a2',
      userId: 'default',
      pendingUserMessage: {
        id: 'u2',
        content: 'Hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })
    expect(enqueueAgentMemoryExchange).not.toHaveBeenCalled()
  })

  it('continues when memory enqueue fails', async () => {
    vi.mocked(enqueueAgentMemoryExchange).mockImplementationOnce(() => {
      throw new Error('memory queue down')
    })
    const result = await runAgentForConversation({
      conversationId: 'c-mem-fail',
      agentId: 'skill:demo',
      assistantMessageId: 'a-mem-fail',
      userId: 'default',
      pendingUserMessage: {
        id: 'u-mem-fail',
        content: 'Hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })
    expect(result.hasError).toBe(false)
    expect(result.finalContent).toBe('done')
  })

  it('notifies renderer when webContents is provided', async () => {
    conversationStoreChangedMock.mockClear()
    notifyConversationStoreChangedMock.mockClear()
    await runAgentForConversation({
      conversationId: 'c-wc',
      agentId: 'skill:demo',
      assistantMessageId: 'a-wc',
      userId: 'default',
      pendingUserMessage: {
        id: 'u-wc',
        content: 'Hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      webContents: { isDestroyed: () => false } as never,
    })
    expect(conversationStoreChangedMock).toHaveBeenCalledWith(
      expect.anything(),
      { conversationId: 'c-wc', agentId: 'skill:demo' },
    )
    expect(notifyConversationStoreChangedMock).not.toHaveBeenCalled()
  })

  it('broadcasts store change when webContents is missing', async () => {
    conversationStoreChangedMock.mockClear()
    notifyConversationStoreChangedMock.mockClear()
    await runAgentForConversation({
      conversationId: 'c-bg',
      agentId: 'skill:demo',
      assistantMessageId: 'a-bg',
      userId: 'default',
      pendingUserMessage: {
        id: 'u-bg',
        content: 'Hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })
    expect(conversationStoreChangedMock).not.toHaveBeenCalled()
    expect(notifyConversationStoreChangedMock).toHaveBeenCalledWith(
      'c-bg',
      'skill:demo',
    )
  })

  it('returns success even when assistant persistence fails', async () => {
    const { getConversationStore } = await import('@main/services/conversation-store')
    vi.mocked(getConversationStore).mockReturnValueOnce({
      saveMessage: vi.fn(() => {
        throw new Error('db down')
      }),
      upsertConversationSandboxRun: vi.fn(),
      getMessageAttachmentsForMessage: vi.fn(() => []),
      getMessages: vi.fn(() => []),
      getConversationHooks: vi.fn(() => ({ hooks: [] })),
      getConversationLlmOverride: getConversationLlmOverrideMock,
    } as never)

    const result = await runAgentForConversation({
      conversationId: 'c-db-fail',
      agentId: 'skill:demo',
      assistantMessageId: 'a-db-fail',
      userId: 'default',
      pendingUserMessage: {
        id: 'u-db-fail',
        content: 'Hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })

    expect(result.hasError).toBe(false)
    expect(result.finalContent).toBe('done')
  })

  it('applies persisted conversation LLM override over agent default providerOptions', async () => {
    getConversationLlmOverrideMock.mockReturnValue({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      providerOptions: {
        google: { thinkingConfig: { thinkingLevel: 'high' } },
      },
    })
    streamAgentResponseMock.mockClear()

    const result = await runAgentForConversation({
      conversationId: 'c-llm-over',
      agentId: 'skill:demo',
      assistantMessageId: 'a-llm-over',
      userId: 'default',
      pendingUserMessage: {
        id: 'u-llm-over',
        content: 'Hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })

    expect(result.hasError).toBe(false)
    expect(getConversationLlmOverrideMock).toHaveBeenCalledWith('c-llm-over')
    const opts = streamAgentResponseMock.mock.calls.at(-1)?.[0] as {
      provider: string
      model: string
      stageLlm: {
        default: {
          provider: string
          model: string
          providerOptions?: Record<string, unknown>
        }
      }
    }
    expect(opts.provider).toBe('gemini')
    expect(opts.model).toBe('gemini-2.5-pro')
    expect(opts.stageLlm.default).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      providerOptions: {
        google: { thinkingConfig: { thinkingLevel: 'high' } },
      },
    })
    expect(opts.stageLlm.default.providerOptions).not.toHaveProperty('ollama')
  })

  it('uses agent LLM settings when conversation override is cleared', async () => {
    getConversationLlmOverrideMock.mockReturnValue(null)
    streamAgentResponseMock.mockClear()

    const result = await runAgentForConversation({
      conversationId: 'c-llm-clear',
      agentId: 'skill:demo',
      assistantMessageId: 'a-llm-clear',
      userId: 'default',
      pendingUserMessage: {
        id: 'u-llm-clear',
        content: 'Hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })

    expect(result.hasError).toBe(false)
    const opts = streamAgentResponseMock.mock.calls.at(-1)?.[0] as {
      provider: string
      model: string
      stageLlm: {
        default: {
          provider: string
          model: string
          providerOptions?: Record<string, unknown>
        }
      }
    }
    expect(opts.provider).toBe('ollama')
    expect(opts.model).toBe('m')
    expect(opts.stageLlm.default).toEqual({
      provider: 'ollama',
      model: 'm',
      providerOptions: {
        ollama: { think: false },
      },
    })
  })
})
