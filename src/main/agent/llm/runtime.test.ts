import { describe, expect, it, vi } from 'vitest'
import { runAgentStream } from './runtime'

describe('runAgentStream', () => {
  it('prefers native toUIMessageStream for Chat IPC chunks', async () => {
    const onChunk = vi.fn()
    const onUIMessageChunk = vi.fn()

    async function* fullStream() {
      yield { type: 'text-start', id: 't0' }
      yield { type: 'text-delta', id: 't0', text: 'hello' }
      yield { type: 'text-end', id: 't0' }
      yield { type: 'finish', finishReason: 'stop' }
    }

    async function* uiStream() {
      yield {
        type: 'tool-approval-request',
        toolCallId: 'call-1',
        approvalId: 'appr-1',
      }
    }

    const result = await runAgentStream({
      result: {
        textStream: (async function* () {})(),
        fullStream: fullStream(),
        toUIMessageStream: () => uiStream(),
        response: Promise.resolve(),
        steps: Promise.resolve([]),
      },
      onChunk,
      onUIMessageChunk,
    })

    expect(result.awaitingToolApproval).toBe(true)
    expect(onUIMessageChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool-approval-request',
        approvalId: 'appr-1',
      }),
    )
  })

  it('emits reasoning UI chunks live from fullStream (not only after finish)', async () => {
    const onUIMessageChunk = vi.fn()
    const emissionOrder: string[] = []

    async function* fullStream() {
      yield { type: 'reasoning-start', id: 'r0' }
      yield { type: 'reasoning-delta', id: 'r0', text: 'First ' }
      emissionOrder.push('after-reasoning-1')
      yield { type: 'reasoning-delta', id: 'r0', text: 'thoughts' }
      emissionOrder.push('after-reasoning-2')
      yield { type: 'reasoning-end', id: 'r0' }
      yield { type: 'text-start', id: 't0' }
      yield { type: 'text-delta', id: 't0', text: 'Answer' }
      emissionOrder.push('after-text')
      yield { type: 'text-end', id: 't0' }
      yield { type: 'finish', finishReason: 'stop' }
    }

    await runAgentStream({
      result: {
        textStream: (async function* () {})(),
        fullStream: fullStream(),
        response: Promise.resolve(),
        steps: Promise.resolve([]),
      },
      onUIMessageChunk: (chunk) => {
        onUIMessageChunk(chunk)
        const type = String(chunk.type ?? '')
        if (type.startsWith('reasoning-')) {
          emissionOrder.push(`ui:${type}`)
        }
      },
    })

    // Reasoning UI must have been published before text finished — i.e. live.
    const firstReasoningUi = emissionOrder.indexOf('ui:reasoning-delta')
    const afterText = emissionOrder.indexOf('after-text')
    expect(firstReasoningUi).toBeGreaterThanOrEqual(0)
    expect(firstReasoningUi).toBeLessThan(afterText)

    expect(onUIMessageChunk).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'reasoning-delta', delta: 'First ' }),
    )
    expect(onUIMessageChunk).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'reasoning-delta', delta: 'thoughts' }),
    )
  })

  it('drains fullStream via LlmProcessor and detects pending tool approval', async () => {
    const onChunk = vi.fn()
    const onUIMessageChunk = vi.fn()

    async function* fullStream() {
      yield { type: 'text-start', id: 't0' }
      yield { type: 'text-delta', id: 't0', text: 'partial ' }
      yield {
        type: 'tool-approval-request',
        toolCallId: 'call-1',
        approvalId: 'appr-1',
      }
      yield { type: 'text-delta', id: 't0', text: 'done' }
      yield { type: 'text-end', id: 't0' }
      yield { type: 'finish', finishReason: 'stop' }
    }

    const result = await runAgentStream({
      result: {
        textStream: (async function* () {})(),
        fullStream: fullStream(),
        response: Promise.resolve(),
        steps: Promise.resolve([]),
      },
      onChunk,
      onUIMessageChunk,
    })

    expect(result.text).toContain('partial')
    expect(result.awaitingToolApproval).toBe(true)
    expect(onUIMessageChunk).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tool-approval-request', toolCallId: 'call-1' }),
    )
  })

  it('falls back to textStream when fullStream is absent', async () => {
    const onChunk = vi.fn()

    async function* textStream() {
      yield 'only '
      yield 'text'
    }

    const result = await runAgentStream({
      result: {
        textStream: textStream(),
        response: Promise.resolve(),
        steps: Promise.resolve([]),
      },
      onChunk,
    })

    expect(result.text).toContain('only')
    expect(onChunk).toHaveBeenCalled()
  })
})
