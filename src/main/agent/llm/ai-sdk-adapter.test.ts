import { describe, expect, it } from 'vitest'
import {
  aiSdkEventToLlmEvents,
  createAiSdkAdapterState,
  drainFullStreamToLlmEvents,
} from './ai-sdk-adapter'

describe('aiSdkEventToLlmEvents', () => {
  it('maps text-delta events', () => {
    const state = createAiSdkAdapterState()
    const events = aiSdkEventToLlmEvents(state, {
      type: 'text-start',
      id: 't1',
    })
    expect(events).toEqual([{ type: 'text-start', id: 't1' }])

    const delta = aiSdkEventToLlmEvents(state, {
      type: 'text-delta',
      id: 't1',
      text: 'hello',
    })
    expect(delta).toEqual([{ type: 'text-delta', id: 't1', text: 'hello' }])

    const sdkDelta = aiSdkEventToLlmEvents(state, {
      type: 'text-delta',
      id: 't1',
      delta: 'world',
    })
    expect(sdkDelta).toEqual([{ type: 'text-delta', id: 't1', text: 'world' }])
  })

  it('maps reasoning-delta events from SDK delta field', () => {
    const state = createAiSdkAdapterState()
    aiSdkEventToLlmEvents(state, { type: 'reasoning-start', id: 'r1' })
    expect(
      aiSdkEventToLlmEvents(state, {
        type: 'reasoning-delta',
        id: 'r1',
        delta: 'thinking',
      }),
    ).toEqual([{ type: 'reasoning-delta', id: 'r1', text: 'thinking' }])
  })

  it('maps tool-call and tool-result', () => {
    const state = createAiSdkAdapterState()
    aiSdkEventToLlmEvents(state, {
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'search',
      input: { q: 'test' },
    })
    const result = aiSdkEventToLlmEvents(state, {
      type: 'tool-result',
      toolCallId: 'c1',
      output: { ok: true },
    })
    expect(result).toEqual([
      { type: 'tool-result', id: 'c1', name: 'search', result: { ok: true } },
    ])
  })

  it('maps finish and resets adapter state', () => {
    const state = createAiSdkAdapterState()
    state.currentTextID = 't1'
    const events = aiSdkEventToLlmEvents(state, {
      type: 'finish',
      finishReason: 'stop',
      totalUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    })
    expect(events[0]?.type).toBe('finish')
    expect(state.currentTextID).toBeUndefined()
  })

  it('maps tool-approval-request', () => {
    const state = createAiSdkAdapterState()
    expect(
      aiSdkEventToLlmEvents(state, {
        type: 'tool-approval-request',
        toolCallId: 'c1',
        approvalId: 'appr-1',
      }),
    ).toEqual([
      {
        type: 'tool-approval-request',
        toolCallId: 'c1',
        approvalId: 'appr-1',
        payload: {
          type: 'tool-approval-request',
          toolCallId: 'c1',
          approvalId: 'appr-1',
        },
      },
    ])
  })

  it('maps tool-output-denied', () => {
    const state = createAiSdkAdapterState()
    expect(
      aiSdkEventToLlmEvents(state, {
        type: 'tool-output-denied',
        toolCallId: 'c2',
      }),
    ).toEqual([
      {
        type: 'tool-output-denied',
        toolCallId: 'c2',
        payload: { type: 'tool-output-denied', toolCallId: 'c2' },
      },
    ])
  })
})

describe('drainFullStreamToLlmEvents', () => {
  it('drains a full stream into events', async () => {
    const collected: string[] = []
    async function* fullStream() {
      yield { type: 'text-start', id: 't0' }
      yield { type: 'text-delta', id: 't0', text: 'a' }
      yield { type: 'text-delta', id: 't0', text: 'b' }
      yield { type: 'text-end', id: 't0' }
      yield { type: 'finish', finishReason: 'stop' }
    }

    await drainFullStreamToLlmEvents(fullStream(), (event) => {
      if (event.type === 'text-delta') collected.push(event.text)
    })

    expect(collected.join('')).toBe('ab')
  })
})
