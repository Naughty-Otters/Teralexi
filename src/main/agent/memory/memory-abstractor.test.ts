import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentMemoryBlock } from './types'

const runLlmStreamMock = vi.fn()

vi.mock('../llm/runtime', () => ({
  runLlmStream: (...args: unknown[]) => runLlmStreamMock(...args),
}))

vi.mock('@teralexi-ai', () => ({
  Output: { object: vi.fn((cfg: unknown) => cfg) },
}))

vi.mock('../providers/retry-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../providers/retry-utils')>()
  return { ...actual, jitteredBackoffMs: () => 0 }
})

vi.mock('../config', () => ({
  withResponseLanguageInstruction: (s: string) => s,
}))

import {
  abstractAgentPersonaMemory,
  abstractPersonaMemory,
  abstractSessionMemory,
  abstractUserPersonaMemory,
} from './memory-abstractor'

function makeBlock(overrides: Partial<AgentMemoryBlock> = {}): AgentMemoryBlock {
  return {
    blockId: 'c1_m1',
    agentId: 'agent',
    conversationId: 'c1',
    userId: 'user',
    recordedAt: '2026-01-01T00:00:00.000Z',
    messages: [
      { role: 'user', id: 'u1', content: 'Hello', createdAt: '2026-01-01T00:00:00.000Z' },
      {
        role: 'assistant',
        id: 'a1',
        content: 'Hi there',
        createdAt: '2026-01-01T00:00:01.000Z',
      },
    ],
    ...overrides,
  }
}

function llmSuccess(output: unknown) {
  return {
    text: '',
    response: Promise.resolve({
      output: Promise.resolve(output),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
    }),
    output,
  }
}

describe('memory-abstractor', () => {
  beforeEach(() => {
    runLlmStreamMock.mockReset()
  })

  it('abstractSessionMemory uses LLM output when valid', async () => {
    runLlmStreamMock.mockResolvedValue(
      llmSuccess({
        summary: 'Session summary',
        facts: ['fact-a'],
        openThreads: ['thread-1'],
      }),
    )
    const block = makeBlock()
    const result = await abstractSessionMemory({
      model: {},
      block,
      conversationBlocks: [block],
      previous: null,
    })
    expect(result.summary).toBe('Session summary')
    expect(result.facts).toContain('fact-a')
    expect(result.openThreads).toContain('thread-1')
  })

  it('abstractSessionMemory falls back when LLM fails', async () => {
    runLlmStreamMock.mockRejectedValue(new Error('context length exceeded'))
    const block = makeBlock()
    const result = await abstractSessionMemory({
      model: {},
      block,
      conversationBlocks: [block],
      previous: null,
    })
    expect(result.summary).toContain('Hello')
    expect(result.blockCount).toBe(1)
  })

  it('abstractPersonaMemory falls back on empty summary', async () => {
    runLlmStreamMock.mockResolvedValue(
      llmSuccess({ summary: '  ', facts: [], userPreferences: [], activeTopics: [] }),
    )
    const block = makeBlock()
    const result = await abstractPersonaMemory({
      model: {},
      block,
      allSessions: [],
    })
    expect(result.userId).toBe('user')
    expect(result.summary.length).toBeGreaterThanOrEqual(0)
  })

  it('abstractAgentPersonaMemory uses only LLM output (no previous persona merge)', async () => {
    runLlmStreamMock.mockResolvedValue(
      llmSuccess({
        summary: 'Persona',
        facts: ['likes tea'],
        userPreferences: ['concise replies'],
        activeTopics: ['project x'],
      }),
    )
    const block = makeBlock()
    const result = await abstractAgentPersonaMemory({
      model: {},
      block,
      recentSessions: [
        {
          agentId: 'agent',
          conversationId: 'c1',
          userId: 'user',
          updatedAt: block.recordedAt,
          blockCount: 1,
          lastBlockId: block.blockId,
          summary: 'prev',
          facts: [],
          openThreads: [],
        },
      ],
    })
    expect(result.summary).toBe('Persona')
    expect(result.facts).toEqual(['likes tea'])
  })

  it('abstractUserPersonaMemory uses only agent persona profiles', async () => {
    runLlmStreamMock.mockResolvedValue(
      llmSuccess({
        summary: 'Global user',
        facts: ['prefers async'],
        userPreferences: ['brief'],
        activeTopics: ['work'],
      }),
    )
    const block = makeBlock()
    const result = await abstractUserPersonaMemory({
      model: {},
      block,
      agentPersonas: [
        {
          agentId: 'agent-a',
          userId: 'user',
          updatedAt: block.recordedAt,
          blockCount: 2,
          lastBlockId: block.blockId,
          lastConversationId: 'c1',
          summary: 'Agent A profile',
          facts: ['fact-a'],
          userPreferences: [],
          activeTopics: [],
        },
      ],
    })
    expect(result.summary).toBe('Global user')
    expect(result.facts).toEqual(['prefers async'])
  })
})
