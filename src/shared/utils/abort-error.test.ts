import { describe, expect, it } from 'vitest'
import { isAbortError } from '@shared/utils/abort-error'

describe('isAbortError', () => {
  it('returns false for nullish and non-errors', () => {
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
    expect(isAbortError('abort')).toBe(false)
    expect(isAbortError({ name: 'AbortError' })).toBe(false)
  })

  it('detects AbortError by name', () => {
    const err = new Error('stopped')
    err.name = 'AbortError'
    expect(isAbortError(err)).toBe(true)
  })

  it('detects DOM abort code 20', () => {
    const err = new Error('aborted') as Error & { code: number }
    err.code = 20
    expect(isAbortError(err)).toBe(true)
  })

  it('matches abort/cancel in message (case insensitive)', () => {
    expect(isAbortError(new Error('Request was aborted'))).toBe(true)
    expect(isAbortError(new Error('User cancel'))).toBe(true)
    expect(isAbortError(new Error('CANCELLED'))).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isAbortError(new Error('network timeout'))).toBe(false)
    expect(isAbortError(new Error('not found'))).toBe(false)
  })
})
