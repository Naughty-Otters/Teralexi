import { describe, expect, it } from 'vitest'
import { isContextOverflowError } from './context-overflow-error'

describe('isContextOverflowError', () => {
  it('matches common provider overflow messages', () => {
    expect(isContextOverflowError(new Error('context length exceeded'))).toBe(
      true,
    )
    expect(isContextOverflowError('Maximum context window reached')).toBe(true)
    expect(isContextOverflowError('prompt is too long for this model')).toBe(
      true,
    )
    expect(isContextOverflowError('token limit exceeded')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isContextOverflowError(new Error('CONTEXT_LENGTH_EXCEEDED'))).toBe(
      true,
    )
  })

  it('returns false for unrelated errors', () => {
    expect(isContextOverflowError(new Error('network timeout'))).toBe(false)
    expect(isContextOverflowError(null)).toBe(false)
    expect(isContextOverflowError({ message: 'rate limited' })).toBe(false)
  })
})
