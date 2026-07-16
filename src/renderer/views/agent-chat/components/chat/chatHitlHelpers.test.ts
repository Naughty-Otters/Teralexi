import { describe, expect, it } from 'vitest'
import type { UIMessage } from '@teralexi-ai'
import { chatMessagesHavePendingHitl } from './chatHitlHelpers'

function assistant(parts: UIMessage['parts'], id = 'a1'): UIMessage {
  return { id, role: 'assistant', parts }
}

function user(parts: UIMessage['parts'], id = 'u1'): UIMessage {
  return { id, role: 'user', parts }
}

describe('chatMessagesHavePendingHitl', () => {
  it('is true while a collect-form request is unanswered', () => {
    const messages = [
      assistant([
        {
          type: 'data-collect-form-request',
          id: 'form-1',
          data: { fields: [] },
        },
      ]),
    ]
    expect(chatMessagesHavePendingHitl(messages)).toBe(true)
  })

  it('is false after the matching form response is present', () => {
    const messages = [
      assistant([
        {
          type: 'data-collect-form-request',
          id: 'form-1',
          data: { fields: [] },
        },
      ]),
      user([
        {
          type: 'data-collect-form-response',
          id: 'form-1',
          data: { values: { title: 'Otters' } },
        },
      ]),
    ]
    expect(chatMessagesHavePendingHitl(messages)).toBe(false)
  })

  it('is true only for pending approval-requested tools, not approval-responded', () => {
    expect(
      chatMessagesHavePendingHitl([
        assistant([
          {
            type: 'dynamic-tool',
            toolName: 'exit_plan_mode',
            toolCallId: 'tc1',
            state: 'approval-requested',
            input: {},
          },
        ]),
      ]),
    ).toBe(true)

    expect(
      chatMessagesHavePendingHitl([
        assistant([
          {
            type: 'dynamic-tool',
            toolName: 'exit_plan_mode',
            toolCallId: 'tc1',
            state: 'approval-responded',
            input: {},
            approval: { id: 'ap1', approved: true },
          },
        ]),
      ]),
    ).toBe(false)
  })
})
