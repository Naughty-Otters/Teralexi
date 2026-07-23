import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearOncePerTurnInjectionState,
  recordOncePerTurnInjection,
  shouldInjectOncePerTurn,
} from './once-per-turn-injection-state'

describe('once-per-turn-injection-state', () => {
  beforeEach(() => {
    clearOncePerTurnInjectionState()
  })

  it('allows first inject then blocks same turn', () => {
    const args = {
      conversationId: 'c1',
      assistantMessageId: 'a1',
    }
    expect(shouldInjectOncePerTurn('workspace-structure', args)).toBe(true)
    recordOncePerTurnInjection('workspace-structure', args)
    expect(shouldInjectOncePerTurn('workspace-structure', args)).toBe(false)
    expect(shouldInjectOncePerTurn('sandbox-structure', args)).toBe(true)
  })

  it('allows again for a new assistant turn', () => {
    recordOncePerTurnInjection('workspace-structure', {
      conversationId: 'c1',
      assistantMessageId: 'a1',
    })
    expect(
      shouldInjectOncePerTurn('workspace-structure', {
        conversationId: 'c1',
        assistantMessageId: 'a2',
      }),
    ).toBe(true)
  })
})
