import { describe, expect, it } from 'vitest'
import { isAgentDomainEvent } from './domain-events'

describe('isAgentDomainEvent', () => {
  it('accepts known agent domain event shapes', () => {
    expect(isAgentDomainEvent({ type: 'agent.llm.text.delta', delta: 'hi' })).toBe(true)
    expect(
      isAgentDomainEvent({
        type: 'agent.llm.tool.updated',
        toolCallId: 'tc1',
        name: 'read_file',
        status: 'running',
      }),
    ).toBe(true)
    expect(
      isAgentDomainEvent({ type: 'agent.llm.step.progress', chunk: '{"step":1}' }),
    ).toBe(true)
    expect(
      isAgentDomainEvent({
        type: 'agent.llm.finish',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        reason: 'stop',
      }),
    ).toBe(true)
  })

  it('rejects unknown or malformed values', () => {
    expect(isAgentDomainEvent(null)).toBe(false)
    expect(isAgentDomainEvent(undefined)).toBe(false)
    expect(isAgentDomainEvent('agent.llm.text.delta')).toBe(false)
    expect(isAgentDomainEvent({ type: 'agent.llm.unknown' })).toBe(false)
    expect(isAgentDomainEvent({ delta: 'x' })).toBe(false)
  })

  it('accepts events that only specify the type field', () => {
    expect(isAgentDomainEvent({ type: 'agent.llm.text.delta' })).toBe(true)
  })
})
