import { describe, expect, it, vi } from 'vitest'
import { createLogger, log, traceFunction } from './logger'

describe('@main/logger re-export', () => {
  it('re-exports main logging framework', () => {
    expect(log).toBeDefined()
    expect(createLogger('test')).toBeDefined()
    const fn = vi.fn(() => 1)
    expect(traceFunction({}, 'fn', fn)(2)).toBe(1)
  })
})
