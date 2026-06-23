import { describe, expect, it } from 'vitest'
import { resolveLatestUserMessageIdentity } from './message-timestamp'

describe('resolveLatestUserMessageIdentity', () => {
  it('prefers the trailing UI user row for the current turn', () => {
    expect(
      resolveLatestUserMessageIdentity({
        clientUiMessages: [
          {
            id: 'user-1',
            role: 'user',
            parts: [{ type: 'text', text: 'first' }],
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'ok' }],
          },
          {
            id: 'user-2',
            role: 'user',
            parts: [{ type: 'text', text: 'second' }],
          },
        ],
      }),
    ).toEqual({
      id: 'user-2',
      createdAt: expect.any(String),
    })
  })

  it('falls back to pendingUserMessage when UI history ends with assistant', () => {
    expect(
      resolveLatestUserMessageIdentity({
        clientUiMessages: [
          {
            id: 'user-1',
            role: 'user',
            parts: [{ type: 'text', text: 'first' }],
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'ok' }],
          },
        ],
        pendingUserMessage: {
          id: 'user-2',
          content: 'second',
          createdAt: '2026-06-20T09:00:00.000Z',
        },
      }),
    ).toEqual({
      id: 'user-2',
      createdAt: '2026-06-20T09:00:00.000Z',
    })
  })

  it('skips injector user messages when falling back to model messages', () => {
    expect(
      resolveLatestUserMessageIdentity({
        modelMessages: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'ok' },
          {
            role: 'user',
            content: '**## Current date and time\n\nUTC**',
          },
          { role: 'user', content: 'second question' },
        ],
      }),
    ).toEqual({
      id: 'user-content:second question',
      createdAt: undefined,
    })
  })
})
