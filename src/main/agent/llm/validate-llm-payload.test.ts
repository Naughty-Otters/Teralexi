import { describe, expect, it } from 'vitest'
import type { ModelMessage } from 'ai'
import {
  LlmPayloadValidationError,
  validateClientUiMessagesForLlm,
  validateModelMessagesForLlm,
  validateSimpleMessagesForLlm,
} from './validate-llm-payload'

describe('validateModelMessagesForLlm', () => {
  it('accepts a valid user message', () => {
    expect(() =>
      validateModelMessagesForLlm([{ role: 'user', content: 'hello' }]),
    ).not.toThrow()
  })

  it('accepts HITL approval resume shape', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'run tool' },
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolCallId: 'tc2', toolName: 'risky', input: {} },
          {
            type: 'tool-approval-request',
            approvalId: 'ap2',
            toolCallId: 'tc2',
          },
        ],
      },
      {
        role: 'tool',
        content: [{ type: 'tool-approval-response', approvalId: 'ap2', approved: true }],
      },
    ]
    expect(() => validateModelMessagesForLlm(messages)).not.toThrow()
  })

  it('rejects orphan tool-approval-response (regression guard)', () => {
    const messages: ModelMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolCallId: 'tc2', toolName: 'risky', input: {} },
          {
            type: 'tool-approval-request',
            approvalId: 'ap2',
            toolCallId: 'tc2',
          },
        ],
      },
      {
        role: 'tool',
        content: [{ type: 'tool-approval-response', approvalId: 'missing', approved: true }],
      },
    ]
    expect(() => validateModelMessagesForLlm(messages)).toThrow(LlmPayloadValidationError)
    try {
      validateModelMessagesForLlm(messages)
    } catch (err) {
      expect(err).toBeInstanceOf(LlmPayloadValidationError)
      expect((err as LlmPayloadValidationError).issues[0]?.code).toBe(
        'orphan-tool-approval-response',
      )
    }
  })

  it('rejects duplicate tool-call ids in one assistant message', () => {
    const messages: ModelMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolCallId: 'tc1', toolName: 'a', input: {} },
          { type: 'tool-call', toolCallId: 'tc1', toolName: 'b', input: {} },
        ],
      },
    ]
    expect(() => validateModelMessagesForLlm(messages)).toThrow(LlmPayloadValidationError)
  })

  it('rejects consecutive assistant messages', () => {
    const messages: ModelMessage[] = [
      { role: 'assistant', content: 'step 1' },
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolCallId: 'tc1', toolName: 't', input: {} },
        ],
      },
    ]
    expect(() => validateModelMessagesForLlm(messages)).toThrow(LlmPayloadValidationError)
  })

  it('rejects orphan tool-result', () => {
    const messages: ModelMessage[] = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'orphan',
            toolName: 'x',
            output: { type: 'text', value: 'ok' },
          },
        ],
      },
    ]
    expect(() => validateModelMessagesForLlm(messages)).toThrow(LlmPayloadValidationError)
  })
})

describe('validateSimpleMessagesForLlm', () => {
  it('accepts user/assistant string messages', () => {
    expect(() =>
      validateSimpleMessagesForLlm([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ]),
    ).not.toThrow()
  })

  it('rejects empty content', () => {
    expect(() =>
      validateSimpleMessagesForLlm([{ role: 'user', content: '   ' }]),
    ).toThrow(LlmPayloadValidationError)
  })
})

describe('validateClientUiMessagesForLlm', () => {
  it('accepts valid UI rows', () => {
    expect(() =>
      validateClientUiMessagesForLlm([
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'go' }] },
      ]),
    ).not.toThrow()
  })

  it('rejects rows without parts', () => {
    expect(() =>
      validateClientUiMessagesForLlm([
        { id: 'a1', role: 'assistant', parts: [] },
      ]),
    ).toThrow(LlmPayloadValidationError)
  })
})
