import { describe, expect, it, vi, beforeEach } from 'vitest'

const streamText = vi.fn()

vi.mock('@teralexi-ai/llm-adapter', () => ({
  streamText: (...args: unknown[]) => streamText(...args),
}))

vi.mock('./validate-llm-payload', () => ({
  validateStreamTextParamsForLlm: vi.fn(),
}))

vi.mock('./llm-debug-writer', () => ({
  buildStreamTextDebugRequest: vi.fn(() => ({})),
  scheduleLlmDebugRequest: vi.fn(() => null),
  scheduleLlmDebugResponse: vi.fn(),
}))

vi.mock('./log-llm-error', () => ({
  logLlmError: vi.fn(),
}))

describe('runLlmStream pipeTextStreamToProgress', () => {
  beforeEach(() => {
    streamText.mockReset()
  })

  it('pipes textStream into emitStepProgress for structured object streams', async () => {
    const { runLlmStream } = await import('./runtime')
    const emitStepProgress = vi.fn()

    async function* fullStream() {
      // Object generation often omits text-deltas from fullStream.
      yield { type: 'finish', finishReason: 'stop' }
    }
    async function* textStream() {
      yield '{"goal":"'
      yield 'live thinking'
      yield '"}'
    }

    streamText.mockReturnValue({
      fullStream: fullStream(),
      textStream: textStream(),
      response: Promise.resolve(),
      output: Promise.resolve({ goal: 'live thinking' }),
    })

    const result = await runLlmStream({
      streamParams: { model: 'test' } as never,
      mode: 'progress',
      pipeTextStreamToProgress: true,
      processorCtx: { emitStepProgress },
    })

    expect(emitStepProgress.mock.calls.map((c) => c[0]).join('')).toBe(
      '{"goal":"live thinking"}',
    )
    expect(result.output).toEqual({ goal: 'live thinking' })
  })
})
