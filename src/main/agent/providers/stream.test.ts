import { describe, expect, it, vi } from 'vitest'
import { APICallError } from 'ai'
import {
  runLlmObjectSilent,
  runLlmObjectWithRetry,
  runLlmTextSilent,
  runLlmTextWithRetry,
  streamLlmObjectToStepProgress,
  streamLlmTextToStepProgress,
} from './stream'

const runLlmStream = vi.fn()

vi.mock('../llm/runtime', () => ({
  runLlmStream: (...args: unknown[]) => runLlmStream(...args),
}))

vi.mock('./usage', () => ({
  readStreamTextUsage: vi.fn(async () => ({ inputTokens: 1, outputTokens: 2 })),
  recordLlmTokenUsageFromOpts: vi.fn(),
}))

vi.mock('./retry-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./retry-utils')>()
  return { ...actual, jitteredBackoffMs: () => 0 }
})

function makeCtx(overrides?: Record<string, unknown>) {
  return {
    opts: { userId: 'u1' },
    stepId: 'thinking',
    emitStepProgress: vi.fn(),
    ...overrides,
  } as never
}

function successStream(text: string, output?: unknown) {
  return {
    text,
    response: Promise.resolve(),
    output,
  }
}

function apiError(status: number, message = `HTTP ${status}`): APICallError {
  return new APICallError({
    message,
    url: 'https://api.example.com',
    requestBodyValues: {},
    statusCode: status,
    responseBody: '',
    isRetryable: status >= 500,
  })
}

describe('streamLlmTextToStepProgress', () => {
  it('streams chunks to step progress', async () => {
    runLlmStream.mockResolvedValue(successStream('hello'))
    const emitStepProgress = vi.fn()
    const out = await streamLlmTextToStepProgress(
      makeCtx({ emitStepProgress }),
      { model: 'test' } as never,
    )
    expect(out.text).toBe('hello')
    expect(runLlmStream).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'progress',
      }),
    )
  })
})

describe('streamLlmObjectToStepProgress', () => {
  it('returns parsed output after streaming', async () => {
    runLlmStream.mockResolvedValue(successStream('x', { ok: true }))
    const out = await streamLlmObjectToStepProgress<{ ok: boolean }>({
      ctx: makeCtx(),
      streamParams: { model: 'test' } as never,
    })
    expect(out.output).toEqual({ ok: true })
    expect(out.text).toBe('x')
  })
})

describe('runLlmObjectSilent', () => {
  it('returns parsed output without emitting step progress', async () => {
    runLlmStream.mockResolvedValue(
      successStream('', { valid: true, summary: 'ok' }),
    )

    const result = await runLlmObjectSilent<{ valid: boolean; summary: string }>({
      ctx: makeCtx(),
      usageSource: 'validation',
      streamParams: { model: 'test' } as never,
    })

    expect(result.output).toEqual({ valid: true, summary: 'ok' })
  })

  it('does not surface retries or final errors to step progress', async () => {
    runLlmStream.mockRejectedValue(
      new Error('No object generated: could not parse the response.'),
    )
    const emitStepProgress = vi.fn()

    await expect(
      runLlmObjectSilent({
        ctx: makeCtx({ emitStepProgress }),
        streamParams: { model: 'test' } as never,
      }),
    ).rejects.toThrow(/No object generated/)

    expect(emitStepProgress).not.toHaveBeenCalled()
    // Parse failures are non-retryable — one attempt only.
    expect(runLlmStream).toHaveBeenCalledTimes(1)
  })
})

describe('runLlmTextSilent', () => {
  it('collects text without emitting progress', async () => {
    runLlmStream.mockResolvedValue(successStream('  silent text  '))

    const emitStepProgress = vi.fn()
    const out = await runLlmTextSilent(
      makeCtx({ emitStepProgress }),
      { model: 'test' } as never,
    )

    expect(out.text).toBe('silent text')
    expect(emitStepProgress).not.toHaveBeenCalled()
  })
})

describe('stream retry behaviour', () => {
  it('retries on 429 rate limit and succeeds on second attempt', async () => {
    runLlmStream
      .mockRejectedValueOnce(apiError(429, 'rate limit exceeded'))
      .mockResolvedValueOnce(successStream('ok'))

    const emitStepProgress = vi.fn()
    const out = await streamLlmTextToStepProgress(
      makeCtx({ emitStepProgress }),
      { model: 'test' } as never,
    )

    expect(out.text).toBe('ok')
    expect(runLlmStream).toHaveBeenCalledTimes(2)
    const calls = emitStepProgress.mock.calls.map((c) => c[0] as string)
    expect(calls.some((s) => s.includes('Retry'))).toBe(true)
  })

  it('retries on 500 server error and succeeds', async () => {
    runLlmStream
      .mockRejectedValueOnce(apiError(500))
      .mockResolvedValueOnce(successStream('data'))

    const out = await streamLlmTextToStepProgress(makeCtx(), { model: 'test' } as never)

    expect(out.text).toBe('data')
    expect(runLlmStream).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry on 401 auth error', async () => {
    runLlmStream.mockRejectedValue(apiError(401))

    const emitStepProgress = vi.fn()
    await expect(
      streamLlmTextToStepProgress(
        makeCtx({ emitStepProgress }),
        { model: 'test' } as never,
      ),
    ).rejects.toThrow()

    expect(runLlmStream).toHaveBeenCalledTimes(1)
    const msgs = emitStepProgress.mock.calls.map((c) => c[0] as string)
    expect(msgs.some((m) => m.includes('⚠ **LLM error**'))).toBe(true)
  })

  it('does NOT retry on 402 billing error', async () => {
    runLlmStream.mockRejectedValue(apiError(402))

    await expect(
      streamLlmTextToStepProgress(makeCtx(), { model: 'test' } as never),
    ).rejects.toThrow()

    expect(runLlmStream).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on 413 context overflow', async () => {
    runLlmStream.mockRejectedValue(apiError(413))

    await expect(
      streamLlmTextToStepProgress(makeCtx(), { model: 'test' } as never),
    ).rejects.toThrow()

    expect(runLlmStream).toHaveBeenCalledTimes(1)
  })

  it('propagates AbortError immediately without retrying', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' })
    runLlmStream.mockRejectedValue(abortErr)

    await expect(
      streamLlmTextToStepProgress(makeCtx(), { model: 'test' } as never),
    ).rejects.toThrow('aborted')

    expect(runLlmStream).toHaveBeenCalledTimes(1)
  })

  it('resets text accumulator on retry so final text is clean', async () => {
    runLlmStream
      .mockRejectedValueOnce(apiError(429))
      .mockResolvedValueOnce(successStream('clean'))

    const out = await streamLlmTextToStepProgress(makeCtx(), { model: 'test' } as never)

    expect(out.text).toBe('clean')
  })
})

describe('background LLM helpers', () => {
  it('runLlmTextWithRetry returns trimmed text', async () => {
    runLlmStream.mockResolvedValue(successStream('  hello  '))
    const text = await runLlmTextWithRetry({
      label: 'test:text',
      streamParams: { model: 'test' } as never,
    })
    expect(text).toBe('hello')
  })

  it('runLlmObjectWithRetry returns parsed output', async () => {
    runLlmStream.mockResolvedValue(successStream('', { ok: true }))
    const output = await runLlmObjectWithRetry<{ ok: boolean }>({
      label: 'test:object',
      streamParams: { model: 'test' } as never,
    })
    expect(output).toEqual({ ok: true })
  })

  it('runLlmTextWithRetry retries on transient failure', async () => {
    runLlmStream
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce(successStream('ok'))

    const text = await runLlmTextWithRetry({
      label: 'test:retry',
      streamParams: { model: 'test' } as never,
    })
    expect(text).toBe('ok')
    expect(runLlmStream).toHaveBeenCalledTimes(2)
  })
})
