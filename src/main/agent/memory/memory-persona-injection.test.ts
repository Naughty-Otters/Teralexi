import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentMemoryPersonaSnapshot } from './types'
import { appCache } from '@main/cache/app-cache'

const loadAgentPersonaSnapshot = vi.fn()
const loadPersonaMemorySnapshot = vi.fn()

vi.mock('./agent-memory-store', () => ({
  loadAgentPersonaSnapshot: (...a: unknown[]) => loadAgentPersonaSnapshot(...a),
  loadPersonaMemorySnapshot: (...a: unknown[]) => loadPersonaMemorySnapshot(...a),
}))

import {
  appendMemoryPersonaToInstructions,
  buildMemoryPersonaInstructionBlock,
  MEMORY_PERSONA_INJECTION_LLM,
  resolveMemoryAgentId,
} from './memory-persona-injection'

function makePersona(
  overrides: Partial<AgentMemoryPersonaSnapshot> = {},
): AgentMemoryPersonaSnapshot {
  return {
    agentId: 'agent-1',
    userId: 'user-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    blockCount: 1,
    lastBlockId: 'b1',
    lastConversationId: 'c1',
    summary: 'Prefers concise answers.',
    facts: ['Works in finance'],
    userPreferences: ['Async updates'],
    activeTopics: ['Q1 planning'],
    ...overrides,
  }
}

describe('memory-persona-injection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appCache.invalidateAllPersona()
  })

  it('resolveMemoryAgentId prefers configured agent id', () => {
    expect(resolveMemoryAgentId('agent-config', 'skill-1')).toBe('agent-config')
    expect(resolveMemoryAgentId(undefined, 'skill-1')).toBe('skill-1')
    expect(resolveMemoryAgentId('', '')).toBeNull()
  })

  it('buildMemoryPersonaInstructionBlock returns empty when no profiles', () => {
    loadPersonaMemorySnapshot.mockReturnValue(null)
    loadAgentPersonaSnapshot.mockReturnValue(null)
    expect(
      buildMemoryPersonaInstructionBlock({
        userId: 'user-1',
        agentId: 'agent-1',
      }),
    ).toBe('')
  })

  it('buildMemoryPersonaInstructionBlock includes user and agent sections', () => {
    loadPersonaMemorySnapshot.mockReturnValue(
      makePersona({ summary: 'Global user profile' }),
    )
    loadAgentPersonaSnapshot.mockReturnValue(
      makePersona({ summary: 'Agent domain profile' }),
    )

    const block = buildMemoryPersonaInstructionBlock({
      userId: 'user-1',
      agentId: 'agent-1',
    })

    expect(block).toContain(MEMORY_PERSONA_INJECTION_LLM.PREAMBLE)
    expect(block).toContain(MEMORY_PERSONA_INJECTION_LLM.USER_PROFILE_HEADER)
    expect(block).toContain('Global user profile')
    expect(block).toContain(MEMORY_PERSONA_INJECTION_LLM.AGENT_PROFILE_HEADER)
    expect(block).toContain('Agent domain profile')
    expect(loadPersonaMemorySnapshot).toHaveBeenCalledWith('user-1', 'agent-1')
    expect(loadAgentPersonaSnapshot).toHaveBeenCalledWith('agent-1')
  })

  it('injects summary only, not facts or preferences', () => {
    loadPersonaMemorySnapshot.mockReturnValue(
      makePersona({ summary: 'User summary text' }),
    )
    loadAgentPersonaSnapshot.mockReturnValue(null)

    const block = buildMemoryPersonaInstructionBlock({
      userId: 'user-1',
      agentId: 'agent-1',
    })

    expect(block).toContain('User summary text')
    expect(block).not.toContain('Works in finance')
    expect(block).not.toContain('Async updates')
    expect(block).not.toContain('Q1 planning')
    expect(block).not.toContain('Facts:')
    expect(block).not.toContain('Preferences:')
    expect(block).not.toContain('Active topics:')
  })

  it('appendMemoryPersonaToInstructions preserves base instructions', () => {
    loadPersonaMemorySnapshot.mockReturnValue(
      makePersona({ summary: 'User only' }),
    )
    loadAgentPersonaSnapshot.mockReturnValue(null)

    const out = appendMemoryPersonaToInstructions('Base executor prompt', {
      userId: 'user-1',
      agentId: 'agent-1',
    })

    expect(out.startsWith('Base executor prompt')).toBe(true)
    expect(out).toContain(MEMORY_PERSONA_INJECTION_LLM.USER_PROFILE_HEADER)
    expect(out).not.toContain(MEMORY_PERSONA_INJECTION_LLM.AGENT_PROFILE_HEADER)
  })
})
