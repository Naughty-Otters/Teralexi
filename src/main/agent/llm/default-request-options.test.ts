import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LLM_TIMEOUT,
  withDefaultLlmTimeout,
} from './default-request-options'

describe('withDefaultLlmTimeout', () => {
  it('injects defaults when timeout is omitted', () => {
    expect(withDefaultLlmTimeout({ model: 'x' })).toEqual({
      model: 'x',
      timeout: { ...DEFAULT_LLM_TIMEOUT },
    })
  })

  it('preserves an explicit timeout object', () => {
    const timeout = { totalMs: 1_000 }
    expect(withDefaultLlmTimeout({ timeout })).toEqual({ timeout })
  })

  it('preserves an explicit numeric timeout', () => {
    expect(withDefaultLlmTimeout({ timeout: 5_000 })).toEqual({
      timeout: 5_000,
    })
  })
})
