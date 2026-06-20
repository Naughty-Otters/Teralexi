import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentMemoryBlock } from './types'

const loadSessionMemorySnapshot = vi.fn()
const loadAllMemoryBlocksForConversation = vi.fn()
const loadRecentSessionMemorySnapshotsForAgent = vi.fn()
const loadAllAgentPersonaSnapshotsForUser = vi.fn()
const persistSessionMemorySnapshot = vi.fn()
const persistAgentPersonaSnapshot = vi.fn()
const persistUserPersonaMemorySnapshot = vi.fn()
const pruneAgentSessionSnapshots = vi.fn()
const loadMemoryRetentionSettings = vi.fn()
const abstractSessionMemory = vi.fn()
const abstractAgentPersonaMemory = vi.fn()
const abstractUserPersonaMemory = vi.fn()

vi.mock('./agent-memory-store', () => ({
  loadSessionMemorySnapshot: (...a: unknown[]) => loadSessionMemorySnapshot(...a),
  loadAllMemoryBlocksForConversation: (...a: unknown[]) =>
    loadAllMemoryBlocksForConversation(...a),
  loadRecentSessionMemorySnapshotsForAgent: (...a: unknown[]) =>
    loadRecentSessionMemorySnapshotsForAgent(...a),
  loadAllAgentPersonaSnapshotsForUser: (...a: unknown[]) =>
    loadAllAgentPersonaSnapshotsForUser(...a),
  persistSessionMemorySnapshot: (...a: unknown[]) => persistSessionMemorySnapshot(...a),
  persistAgentPersonaSnapshot: (...a: unknown[]) => persistAgentPersonaSnapshot(...a),
  persistUserPersonaMemorySnapshot: (...a: unknown[]) =>
    persistUserPersonaMemorySnapshot(...a),
  pruneAgentSessionSnapshots: (...a: unknown[]) => pruneAgentSessionSnapshots(...a),
}))

vi.mock('./memory-retention-settings', () => ({
  loadMemoryRetentionSettings: () => loadMemoryRetentionSettings(),
}))

vi.mock('./memory-abstractor', () => ({
  abstractSessionMemory: (...a: unknown[]) => abstractSessionMemory(...a),
  abstractAgentPersonaMemory: (...a: unknown[]) => abstractAgentPersonaMemory(...a),
  abstractUserPersonaMemory: (...a: unknown[]) => abstractUserPersonaMemory(...a),
}))

import {
  abstractAgentPersonaForBlock,
  abstractSessionForBlock,
  abstractUserPersonaForBlock,
} from './memory-abstraction-runners'

function makeBlock(): AgentMemoryBlock {
  return {
    blockId: 'c1_m1',
    agentId: 'agent-1',
    conversationId: 'conv-1',
    userId: 'user-1',
    recordedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
  }
}

describe('memory-abstraction-runners', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadMemoryRetentionSettings.mockReturnValue({
      sessionsPerAgent: 5,
      sessionsForAgentPersona: 3,
    })
    loadSessionMemorySnapshot.mockReturnValue(null)
    loadAllMemoryBlocksForConversation.mockReturnValue([])
    loadRecentSessionMemorySnapshotsForAgent.mockReturnValue([])
    loadAllAgentPersonaSnapshotsForUser.mockReturnValue([])
    abstractSessionMemory.mockResolvedValue({ snapshotId: 'session-1' })
    abstractAgentPersonaMemory.mockResolvedValue({ snapshotId: 'agent-1' })
    abstractUserPersonaMemory.mockResolvedValue({ snapshotId: 'user-1' })
  })

  it('abstractSessionForBlock loads context, abstracts, persists, and prunes', async () => {
    const block = makeBlock()
    const previous = { snapshotId: 'prev' }
    const conversationBlocks = [block]
    loadSessionMemorySnapshot.mockReturnValue(previous)
    loadAllMemoryBlocksForConversation.mockReturnValue(conversationBlocks)

    await abstractSessionForBlock({ block, model: {}, responseLanguage: 'en' })

    expect(loadSessionMemorySnapshot).toHaveBeenCalledWith('agent-1', 'conv-1')
    expect(loadAllMemoryBlocksForConversation).toHaveBeenCalledWith('agent-1', 'conv-1')
    expect(abstractSessionMemory).toHaveBeenCalledWith({
      model: {},
      block,
      conversationBlocks,
      previous,
      responseLanguage: 'en',
      abortSignal: undefined,
    })
    expect(persistSessionMemorySnapshot).toHaveBeenCalledWith({ snapshotId: 'session-1' })
    expect(pruneAgentSessionSnapshots).toHaveBeenCalledWith('agent-1', 5)
  })

  it('abstractAgentPersonaForBlock uses recent sessions and retention limit', async () => {
    const block = makeBlock()
    const recent = [{ snapshotId: 's1' }]
    loadRecentSessionMemorySnapshotsForAgent.mockReturnValue(recent)

    await abstractAgentPersonaForBlock({ block, model: 'llm' })

    expect(loadRecentSessionMemorySnapshotsForAgent).toHaveBeenCalledWith('agent-1', 3)
    expect(abstractAgentPersonaMemory).toHaveBeenCalledWith({
      model: 'llm',
      block,
      recentSessions: recent,
      responseLanguage: undefined,
      abortSignal: undefined,
    })
    expect(persistAgentPersonaSnapshot).toHaveBeenCalledWith({ snapshotId: 'agent-1' })
  })

  it('abstractUserPersonaForBlock aggregates agent personas for the user', async () => {
    const block = makeBlock()
    const personas = [{ agentId: 'agent-1', summary: 'helpful' }]
    loadAllAgentPersonaSnapshotsForUser.mockReturnValue(personas)

    await abstractUserPersonaForBlock({ block, model: {}, abortSignal: new AbortController().signal })

    expect(loadAllAgentPersonaSnapshotsForUser).toHaveBeenCalledWith('user-1')
    expect(abstractUserPersonaMemory).toHaveBeenCalledWith({
      model: {},
      block,
      agentPersonas: personas,
      responseLanguage: undefined,
      abortSignal: expect.any(AbortSignal),
    })
    expect(persistUserPersonaMemorySnapshot).toHaveBeenCalledWith({ snapshotId: 'user-1' })
  })
})
