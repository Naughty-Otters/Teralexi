import { describe, expect, it } from 'vitest'
import type { UIMessage } from '@teralexi-ai'
import {
  parsePersistedCollectFormResponse,
  userCollectFormResponseChipLabel,
  userMessagePlainText,
  userSubmittedFormView,
} from './chatUserMessageHelpers'

describe('parsePersistedCollectFormResponse', () => {
  it('parses id and nested values from transport persistence text', () => {
    const text = [
      '[data-collect-form-response:079c6de54ce9]',
      '{"values":{"eventName":"Bayarea dog meetup","location":"San Ramon CA"}}',
    ].join('\n')
    expect(parsePersistedCollectFormResponse(text)).toEqual({
      requestId: '079c6de54ce9',
      values: {
        eventName: 'Bayarea dog meetup',
        location: 'San Ramon CA',
      },
    })
  })

  it('returns null for ordinary user text', () => {
    expect(parsePersistedCollectFormResponse('hello there')).toBeNull()
  })
})

describe('userSubmittedFormView / plain text', () => {
  it('builds a read-only field list from a live response part', () => {
    const message = {
      id: 'u1',
      role: 'user',
      parts: [
        {
          type: 'data-collect-form-response',
          id: 'req-1',
          data: { values: { eventName: 'Meetup', date: 'july18' } },
        },
      ],
    } as UIMessage

    expect(userSubmittedFormView(message)).toEqual({
      requestId: 'req-1',
      fields: [
        { key: 'eventName', label: 'Event Name', value: 'Meetup' },
        { key: 'date', label: 'Date', value: 'july18' },
      ],
    })
    expect(userMessagePlainText(message)).toBe('')
    expect(userCollectFormResponseChipLabel(message)).toBe(
      'Form submitted (2 fields)',
    )
  })

  it('hides persisted raw JSON from plain text and exposes fields instead', () => {
    const text = [
      '[data-collect-form-response:abc]',
      '{"values":{"description":"let\'s go"}}',
    ].join('\n')
    const message = {
      id: 'u2',
      role: 'user',
      parts: [{ type: 'text', text, state: 'done' }],
    } as UIMessage

    expect(userMessagePlainText(message)).toBe('')
    expect(userSubmittedFormView(message)?.fields).toEqual([
      { key: 'description', label: 'Description', value: "let's go" },
    ])
  })
})
