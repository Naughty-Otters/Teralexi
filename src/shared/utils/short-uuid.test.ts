import { describe, expect, it, vi } from 'vitest'
import { randomShortUuid } from './short-uuid'

describe('randomShortUuid', () => {
  it('returns requested length using crypto when available', () => {
    const id = randomShortUuid(8)
    expect(id).toHaveLength(8)
    expect(id).toMatch(/^[0-9a-f]+$/)
  })

  it('falls back to Math.random when crypto is unavailable', () => {
    const crypto = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    try {
      expect(randomShortUuid(6)).toHaveLength(6)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: crypto, configurable: true })
    }
  })
})
