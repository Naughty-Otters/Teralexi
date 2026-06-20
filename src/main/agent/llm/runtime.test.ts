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
    const result = await runAgentStream({
      result: {
        textStream: (async function* () {
          yield 'hello '
          yield 'world'
        })(),
        response: Promise.resolve({ text: 'hello world' }),
      },
      onChunk,
    })
    expect(result.text).toBe('hello world')
    expect(result.awaitingToolApproval).toBe(false)
    expect(onChunk).toHaveBeenCalled()
  })
})
