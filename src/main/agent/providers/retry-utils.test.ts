import { describe, expect, it, vi } from 'vitest'
import { jitteredBackoffMs, withLlmRetry } from './retry-utils'
import { ErrorCategory } from './error-classifier'

// ---------------------------------------------------------------------------
// jitteredBackoffMs
// ---------------------------------------------------------------------------

describe('jitteredBackoffMs', () => {
  it('returns a value >= baseMs on attempt 0', () => {
    const ms = jitteredBackoffMs(0, 1_000, 30_000)
    expect(ms).toBeGreaterThanOrEqual(1_000)
  })

  it('doubles on each attempt (before jitter)', () => {
    // Without jitter the formula is base * 2^attempt. With jitter it's always >=.
    expect(jitteredBackoffMs(1, 1_000, 30_000)).toBeGreaterThanOrEqual(2_000)
    expect(jitteredBackoffMs(2, 1_000, 30_000)).toBeGreaterThanOrEqual(4_000)
  })

  it('caps at maxMs', () => {
    const ms = jitteredBackoffMs(100, 1_000, 30_000)
    expect(ms).toBeLessThanOrEqual(30_000 * 1.5) // maxMs + up-to-50% jitter
  })

  it('produces different values on repeated calls (jitter)', () => {
    const values = new Set(Array.from({ length: 10 }, () => jitteredBackoffMs(0)))
    expect(values.size).toBeGreaterThan(1)
  })
})

// ---------------------------------------------------------------------------
// withLlmRetry — uses a mocked sleep so tests are instant
// ---------------------------------------------------------------------------

// We mock the module-level setTimeout so sleep() resolves immediately.
vi.stubGlobal('setTimeout', (fn: () => void) => { fn(); return 0 })

function makeCtx() {
  return { emitStepProgress: vi.fn(), opts: { userId: 'u1' }, stepId: 'test' } as never
}

function retryableError(): Error {
  return Object.assign(new Error('503 server error'), { statusCode: 503 })
}

function abortError(): Error {
  return Object.assign(new Error('aborted'), { name: 'AbortError' })
}

function authError(): Error {
  // Classified as non-retryable AUTH via the APICallError branch
  const err = new Error('401 Unauthorized')
  ;(err as unknown as Record<string, unknown>).statusCode = 401
  return err
}

describe('withLlmRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValueOnce('ok')
    const result = await withLlmRetry(makeCtx(), 'test', fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries and succeeds on second attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(retryableError())
      .mockResolvedValueOnce('ok')

    const result = await withLlmRetry(makeCtx(), 'test', fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('exhausts retries and throws after maxRetries + 1 attempts', async () => {
    const fn = vi.fn().mockRejectedValue(retryableError())

    await expect(withLlmRetry(makeCtx(), 'test', fn, { maxRetries: 3 })).rejects.toThrow()
    // 1 initial + 3 retries = 4 total
    expect(fn).toHaveBeenCalledTimes(4)
  })

  it('emits retry notification to step progress', async () => {
    const ctx = makeCtx()
    const fn = vi.fn()
      .mockRejectedValueOnce(retryableError())
      .mockResolvedValueOnce('ok')

    await withLlmRetry(ctx, 'test', fn)

    const calls = (ctx.emitStepProgress as ReturnType<typeof vi.fn>).mock.calls
    const messages = calls.map((c) => c[0] as string)
    expect(messages.some((m) => m.includes('Retry'))).toBe(true)
  })

  it('propagates AbortError immediately without retrying', async () => {
    const fn = vi.fn().mockRejectedValue(abortError())

    await expect(withLlmRetry(makeCtx(), 'test', fn)).rejects.toThrow('aborted')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('re-throws non-retryable errors without retrying', async () => {
    // Use a plain error that matches CONTEXT_OVERFLOW pattern → non-retryable
    const err = new Error('context length exceeded')
    const fn = vi.fn().mockRejectedValue(err)

    await expect(withLlmRetry(makeCtx(), 'test', fn)).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('respects custom maxRetries option', async () => {
    const fn = vi.fn().mockRejectedValue(retryableError())

    await expect(withLlmRetry(makeCtx(), 'test', fn, { maxRetries: 1 })).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(2) // 1 initial + 1 retry
  })

  it('reports the classified error category in the retry notification', async () => {
    const ctx = makeCtx()
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
      .mockResolvedValueOnce('ok')

    await withLlmRetry(ctx, 'test', fn)

    const msgs = (ctx.emitStepProgress as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string)
    expect(msgs.some((m) => m.includes(ErrorCategory.RATE_LIMIT))).toBe(true)
  })

  it('emits formatted error on final failure', async () => {
    const ctx = makeCtx()
    const fn = vi.fn().mockRejectedValue(retryableError())

    await expect(withLlmRetry(ctx, 'test', fn, { maxRetries: 1 })).rejects.toThrow()

    const msgs = (ctx.emitStepProgress as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string)
    expect(msgs.some((m) => m.includes('⚠ **LLM error**'))).toBe(true)
    expect(msgs.some((m) => m.includes('test'))).toBe(true)
  })

  it('does not emit step progress on AbortError', async () => {
    const ctx = makeCtx()
    const fn = vi.fn().mockRejectedValue(abortError())

    await expect(withLlmRetry(ctx, 'test', fn)).rejects.toThrow('aborted')

    expect(ctx.emitStepProgress).not.toHaveBeenCalled()
  })
})
