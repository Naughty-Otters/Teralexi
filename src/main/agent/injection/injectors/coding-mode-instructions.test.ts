import { describe, expect, it, vi, beforeEach } from 'vitest'

const getCodingModeForConversation = vi.hoisted(() => vi.fn())
const codingModeSystemAddendum = vi.hoisted(() => vi.fn())
const isSubAgentAgentRun = vi.hoisted(() => vi.fn())

vi.mock('../../coding/coding-agent-policy', () => ({
  getCodingModeForConversation,
  codingModeSystemAddendum,
}))
vi.mock('../../run/sub-agent-run-policy', () => ({
  isSubAgentAgentRun,
}))

import { codingModeInstructionsInjector } from './coding-mode-instructions'

describe('codingModeInstructionsInjector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isSubAgentAgentRun.mockReturnValue(false)
    getCodingModeForConversation.mockReturnValue('normal')
    codingModeSystemAddendum.mockReturnValue('  normal addendum  ')
  })

  it('applies only during tool loop', () => {
    expect(
      codingModeInstructionsInjector.applies({
        profile: { stage: 'toolLoop' },
      } as never),
    ).toBe(true)
    expect(
      codingModeInstructionsInjector.applies({
        profile: { stage: 'planning' },
      } as never),
    ).toBe(false)
  })

  it('skips sub-agent runs', () => {
    isSubAgentAgentRun.mockReturnValue(true)

    expect(
      codingModeInstructionsInjector.injectInstructions({
        ctx: { opts: { conversationId: 'conv-1', skillId: 'coding' } },
      } as never),
    ).toBeNull()
  })

  it('skips explore/auto addendum for non-coding skills', () => {
    getCodingModeForConversation.mockReturnValue('explore')

    expect(
      codingModeInstructionsInjector.injectInstructions({
        ctx: { opts: { conversationId: 'conv-1', skillId: 'documents' } },
      } as never),
    ).toBeNull()
    expect(codingModeSystemAddendum).not.toHaveBeenCalled()
  })

  it('injects trimmed addendum for coding skills', () => {
    getCodingModeForConversation.mockReturnValue('explore')

    const result = codingModeInstructionsInjector.injectInstructions({
      ctx: { opts: { conversationId: 'conv-1', skillId: 'coding' } },
    } as never)

    expect(codingModeSystemAddendum).toHaveBeenCalledWith('explore')
    expect(result).toBe('normal addendum')
  })

  it('returns null when addendum is empty', () => {
    codingModeSystemAddendum.mockReturnValue('   ')

    const result = codingModeInstructionsInjector.injectInstructions({
      ctx: { opts: { conversationId: 'conv-1', skillId: 'coding' } },
    } as never)

    expect(result).toBeNull()
  })
})
