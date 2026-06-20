import { describe, expect, it, vi } from 'vitest'
import { LlmProcessor, processLlmEvents } from './processor'
import { createAgentEventBus } from '../bus/agent-event-bus'

describe('LlmProcessor', () => {
  it('accumulates text and calls onChunk in progress mode', () => {
    const onChunk = vi.fn()
    const state = processLlmEvents(
      [
        { type: 'text-delta', id: 't0', text: 'hel' },
        { type: 'text-delta', id: 't0', text: 'lo' },
      ],
      { mode: 'progress', onChunk },
    )
    expect(state.text).toBe('hello')
    expect(onChunk).toHaveBeenCalledWith('hel')
    expect(onChunk).toHaveBeenCalledWith('lo')
  })

  it('routes text through emitStepProgress when step sink is wired', () => {
    const onChunk = vi.fn()
    const emitStepProgress = vi.fn()
    processLlmEvents(
      [
        { type: 'text-delta', id: 't0', text: 'hel' },
        { type: 'text-delta', id: 't0', text: 'lo' },
      ],
      { mode: 'progress', onChunk, emitStepProgress },
    )
    expect(onChunk).not.toHaveBeenCalled()
    expect(emitStepProgress).toHaveBeenCalledWith('hel')
    expect(emitStepProgress).toHaveBeenCalledWith('lo')
  })

  it('does not emit in silent mode', () => {
    const onChunk = vi.fn()
    processLlmEvents(
      [{ type: 'text-delta', id: 't0', text: 'x' }],
      { mode: 'silent', onChunk },
    )
    expect(onChunk).not.toHaveBeenCalled()
  })

  it('publishes to event bus', () => {
    const bus = createAgentEventBus()
    const received: string[] = []
    bus.subscribe('agent.llm.text.delta', (e) => {
      if (e.type === 'agent.llm.text.delta') received.push(e.delta)
    })
    processLlmEvents(
      [{ type: 'text-delta', id: 't0', text: 'bus' }],
      { mode: 'progress', bus },
    )
    expect(received).toEqual(['bus'])
  })

  it('throws on provider-error', () => {
    const processor = new LlmProcessor()
    expect(() =>
      processor.processEvent(
        { type: 'provider-error', message: 'boom' },
        { mode: 'progress' },
      ),
    ).toThrow('boom')
  })
})
