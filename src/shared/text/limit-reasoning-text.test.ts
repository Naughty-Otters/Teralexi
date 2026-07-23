import { describe, expect, it } from 'vitest'
import {
  REASONING_TRUNCATION_MARKER,
  appendReasoningDeltaWithCap,
  createReasoningCapState,
} from './limit-reasoning-text'

describe('appendReasoningDeltaWithCap', () => {
  it('passes through small deltas unchanged', () => {
    const state = createReasoningCapState()
    const result = appendReasoningDeltaWithCap(state, 'hello', 20)
    expect(result).toEqual({ emitDelta: 'hello', resetPart: false })
    expect(state.buffer).toBe('hello')
  })

  it('resets the reasoning part once the buffer overflows', () => {
    const state = createReasoningCapState()
    appendReasoningDeltaWithCap(state, '1234567890', 8)
    const overflow = appendReasoningDeltaWithCap(state, 'abcdef', 8)
    expect(overflow.resetPart).toBe(true)
    expect(overflow.resetText).toContain(REASONING_TRUNCATION_MARKER)
    expect(overflow.resetText?.endsWith('90abcdef')).toBe(true)
  })

  it('resets when the 2k-word ceiling reshapes the visible window', () => {
    const state = createReasoningCapState()
    const words = Array.from({ length: 2001 }, (_, i) => `w${i}`)
    const first = words.slice(0, 2000).join(' ')
    const last = words[2000]!
    appendReasoningDeltaWithCap(state, first, 500_000)
    const overflow = appendReasoningDeltaWithCap(state, ` ${last}`, 500_000)
    expect(overflow.resetPart).toBe(true)
    expect(overflow.resetText).toContain('…[earlier thinking omitted]')
    expect(overflow.resetText?.endsWith(last)).toBe(true)
  })
})
