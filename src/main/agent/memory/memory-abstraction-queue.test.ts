import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentMemoryBlock } from './types'

const abstractSession = vi.fn()
const abstractAgentPersona = vi.fn()
const abstractUserPersona = vi.fn()

vi.mock('./memory-abstraction-runners', () => ({
  abstractSessionForBlock: (...a: unknown[]) => abstractSession(...a),
  abstractAgentPersonaForBlock: (...a: unknown[]) => abstractAgentPersona(...a),
  abstractUserPersonaForBlock: (...a: unknown[]) => abstractUserPersona(...a),
}))

import {
  MemoryAbstractionQueue,
  resetMemoryAbstractionQueueForTests,
} from './memory-abstraction-queue'

function makeBlock(overrides: Partial<AgentMemoryBlock> = {}): AgentMemoryBlock {
  return {
    blockId: 'c1_a1',
    agentId: 'agent',
    conversationId: 'c1',
    userId: 'u',
    recordedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
    ...overrides,
  }
}

describe('MemoryAbstractionQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    abstractSession.mockResolvedValue(undefined)
    abstractAgentPersona.mockResolvedValue(undefined)
    abstractUserPersona.mockResolvedValue(undefined)
  })

  afterEach(() => {
    resetMemoryAbstractionQueueForTests()
  })

  it('coalesces duplicate session jobs for the same conversation', async () => {
    const queue = new MemoryAbstractionQueue(1)
    const block1 = makeBlock({ blockId: 'c1_a1' })
    const block2 = makeBlock({ blockId: 'c1_a2' })

    queue.enqueueFromExchange({
      block: block1,
      model: {},
      session: true,
      persona: false,
    })
    queue.enqueueFromExchange({
      block: block2,
      model: {},
      session: true,
      persona: false,
    })

    expect(queue.getPendingCount()).toBe(1)

    await vi.waitFor(() => {
      expect(abstractSession).toHaveBeenCalledTimes(1)
    })

    expect(abstractSession).toHaveBeenCalledWith(
      expect.objectContaining({ block: block2 }),
    )
  })

  it('coalesces persona jobs per agent and user', async () => {
    const queue = new MemoryAbstractionQueue(1)
    const block1 = makeBlock({ blockId: 'c1_a1' })
    const block2 = makeBlock({ blockId: 'c1_a2' })

    queue.enqueueFromExchange({
      block: block1,
      model: {},
      session: false,
      persona: true,
    })
    queue.enqueueFromExchange({
      block: block2,
      model: {},
      session: false,
      persona: true,
    })

    expect(queue.getPendingCount()).toBe(2)

    await vi.waitFor(() => {
      expect(abstractAgentPersona).toHaveBeenCalledTimes(1)
      expect(abstractUserPersona).toHaveBeenCalledTimes(1)
    })

    expect(abstractAgentPersona).toHaveBeenCalledWith(
      expect.objectContaining({ block: block2 }),
    )
    expect(abstractUserPersona).toHaveBeenCalledWith(
      expect.objectContaining({ block: block2 }),
    )
  })

  it('runs session jobs before persona jobs', async () => {
    const order: string[] = []
    abstractSession.mockImplementation(async () => {
      order.push('session')
    })
    abstractAgentPersona.mockImplementation(async () => {
      order.push('agent-persona')
    })
    abstractUserPersona.mockImplementation(async () => {
      order.push('user-persona')
    })

    const queue = new MemoryAbstractionQueue(1)
    queue.enqueueFromExchange({
      block: makeBlock(),
      model: {},
      session: true,
      persona: true,
    })

    await vi.waitFor(() => {
      expect(order).toEqual(['session', 'agent-persona', 'user-persona'])
    })
  })
})
