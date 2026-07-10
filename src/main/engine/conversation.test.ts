import { describe, expect, it, vi } from 'vitest'

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

vi.mock('@logging', () => ({
  runWithAgentRunLog: (_ctx: unknown, fn: () => unknown) => fn(),
}))

const {
  streamAgentResponseMock,
  notifyFinishedMock,
  conversationStoreChangedMock,
  notifyConversationStoreChangedMock,
  ensureUserAttachmentsUploadedBeforeAgentRunMock,
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
  }))

vi.mock('@main/services/chat-attachments', () => ({
  ensureUserAttachmentsUploadedBeforeAgentRun:
    ensureUserAttachmentsUploadedBeforeAgentRunMock,
  resolveUserAttachmentsForTurn: ensureUserAttachmentsUploadedBeforeAgentRunMock,
}))

vi.mock('@main/agent/flow', () => ({
  streamAgentResponse: streamAgentResponseMock,
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
  loadConversationHistory: vi.fn(() => []),
  loadMcpToolsForAgent: vi.fn(async () => []),
  resolveEnabledSkillToolNames: vi.fn(() => []),
}))

vi.mock('@main/agent/agent-stream-bridge', () => ({
  createAgentStreamBridge: vi.fn(() => ({
    onChunk: vi.fn(),
    onUIMessageChunk: vi.fn(),
    onStepProgress: vi.fn(),
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
})
