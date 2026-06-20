import { describe, expect, it } from 'vitest'
import type {
  AgentMemoryBlock,
  AgentMemoryMessage,
  AgentMemoryPersonaSnapshot,
  AgentMemorySessionSnapshot,
} from './types'

describe('agent memory types (smoke)', () => {
  it('accepts representative shapes', () => {
    const message: AgentMemoryMessage = {
      role: 'user',
      id: 'u1',
      content: 'hi',
      createdAt: '2020-01-01T00:00:00.000Z',
    }
    const block: AgentMemoryBlock = {
      blockId: 'c1_a1',
      agentId: 'agent',
      conversationId: 'c1',
      userId: 'default',
      recordedAt: message.createdAt,
      messages: [message],
    }
    const session: AgentMemorySessionSnapshot = {
      ...block,
      updatedAt: block.recordedAt,
      blockCount: 1,
      lastBlockId: block.blockId,
      summary: '',
      facts: [],
      openThreads: [],
    }
    const persona: AgentMemoryPersonaSnapshot = {
      agentId: block.agentId,
      userId: block.userId,
      updatedAt: block.recordedAt,
      blockCount: 1,
      lastBlockId: block.blockId,
      lastConversationId: block.conversationId,
      summary: '',
      facts: [],
      userPreferences: [],
      activeTopics: [],
    }
    expect(persona.lastConversationId).toBe(session.conversationId)
  })
})
