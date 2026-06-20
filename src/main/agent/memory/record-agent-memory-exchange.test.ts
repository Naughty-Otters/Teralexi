import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const persistBlock = vi.fn()
const pruneBlocks = vi.fn()
const enqueueFromExchange = vi.fn()
const abstractSession = vi.fn()
const abstractAgentPersona = vi.fn()
const abstractUserPersona = vi.fn()
const persistVectorRecords = vi.fn()

vi.mock('./agent-memory-store', () => ({
  persistAgentMemoryBlock: (...a: unknown[]) => persistBlock(...a),
  pruneAgentMemoryBlocks: (...a: unknown[]) => pruneBlocks(...a),
}))

vi.mock('./memory-abstraction-queue', () => ({
  getMemoryAbstractionQueue: vi.fn(() => ({
    enqueueFromExchange: (...a: unknown[]) => enqueueFromExchange(...a),
  })),
}))

vi.mock('./memory-abstraction-runners', () => ({
  abstractSessionForBlock: (...a: unknown[]) => abstractSession(...a),
  abstractAgentPersonaForBlock: (...a: unknown[]) => abstractAgentPersona(...a),
  abstractUserPersonaForBlock: (...a: unknown[]) => abstractUserPersona(...a),
}))

vi.mock('./memory-recording-settings', () => ({
  loadMemoryRecordingSettings: vi.fn(() => ({
    block: true,
    session: true,
    persona: true,
    vector: true,
  })),
}))

vi.mock('./vector-memory-store', () => ({
  persistMemoryVectorRecordsFromBlock: (...a: unknown[]) =>
    persistVectorRecords(...a),
}))

vi.mock('./memory-retention-settings', () => ({
  loadMemoryRetentionSettings: vi.fn(() => ({
    blocksPerAgent: 5,
    sessionsPerAgent: 5,
    sessionsForAgentPersona: 5,
  })),
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    getMessages: vi.fn(() => []),
  })),
}))

vi.mock('../utils', () => ({
  extractTrailingUserForPersistence: vi.fn(() => null),
  parseClientUiMessages: vi.fn(() => []),
  serializeAssistantMessageForHistory: (s: string) => s,
}))

import { loadMemoryRecordingSettings } from './memory-recording-settings'
import {
  enqueueAgentMemoryExchange,
  recordAgentMemoryExchange,
} from './record-agent-memory-exchange'

describe('recordAgentMemoryExchange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    abstractSession.mockResolvedValue(undefined)
    abstractAgentPersona.mockResolvedValue(undefined)
    abstractUserPersona.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('no-ops when assistant content empty', async () => {
    await recordAgentMemoryExchange({
      agentId: 'agent',
      conversationId: 'c1',
      userId: 'u',
      assistantMessageId: 'a1',
      assistantContent: '   ',
      model: {},
    })
    expect(persistBlock).not.toHaveBeenCalled()
  })

  it('persists block and runs abstraction synchronously when using recordAgentMemoryExchange', async () => {
    await recordAgentMemoryExchange({
      agentId: 'agent',
      conversationId: 'c1',
      userId: 'u',
      assistantMessageId: 'a1',
      assistantContent: 'Answer',
      model: {},
      pendingUserMessage: {
        id: 'u1',
        content: 'Question',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })
    expect(persistBlock).toHaveBeenCalled()
    expect(persistVectorRecords).toHaveBeenCalled()
    expect(pruneBlocks).toHaveBeenCalledWith('agent', 5)
    expect(abstractSession).toHaveBeenCalled()
    expect(abstractAgentPersona).toHaveBeenCalled()
    expect(abstractUserPersona).toHaveBeenCalled()
    expect(enqueueFromExchange).not.toHaveBeenCalled()
  })

  it('skips vector index when vector recording is disabled', () => {
    vi.mocked(loadMemoryRecordingSettings).mockReturnValue({
      block: true,
      session: false,
      persona: false,
      vector: false,
    })

    enqueueAgentMemoryExchange({
      agentId: 'agent',
      conversationId: 'c1',
      userId: 'u',
      assistantMessageId: 'a1',
      assistantContent: 'Answer',
      model: {},
      pendingUserMessage: {
        id: 'u1',
        content: 'Question',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })

    expect(persistBlock).toHaveBeenCalled()
    expect(persistVectorRecords).not.toHaveBeenCalled()

    vi.mocked(loadMemoryRecordingSettings).mockReturnValue({
      block: true,
      session: true,
      persona: true,
      vector: true,
    })
  })

  it('enqueueAgentMemoryExchange persists block and queues abstraction', () => {
    enqueueAgentMemoryExchange({
      agentId: 'agent',
      conversationId: 'c1',
      userId: 'u',
      assistantMessageId: 'a1',
      assistantContent: 'Answer',
      model: {},
      pendingUserMessage: {
        id: 'u1',
        content: 'Question',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })
    expect(persistBlock).toHaveBeenCalled()
    expect(persistVectorRecords).toHaveBeenCalled()
    expect(enqueueFromExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        session: true,
        persona: true,
      }),
    )
    expect(abstractSession).not.toHaveBeenCalled()
  })
})
