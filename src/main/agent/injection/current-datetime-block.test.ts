import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearDatetimeInjectionState,
  recordDatetimeInjection,
} from './conversation-injection-state'
import {
  formatCurrentDatetimeInstructionBlock,
  shouldInjectCurrentDatetime,
} from './current-datetime-block'
import { buildInjectorUserMessage } from './injector'

describe('formatCurrentDatetimeInstructionBlock', () => {
  it('includes UTC, local time, and timezone', () => {
    const block = formatCurrentDatetimeInstructionBlock({
      now: new Date('2026-06-20T18:30:00.000Z'),
      timeZone: 'America/New_York',
    })

    expect(block).toContain('## Current date and time')
    expect(block).toContain('UTC (ISO 8601): 2026-06-20T18:30:00.000Z')
    expect(block).toContain('America/New_York')
    expect(block).toContain('Timezone: America/New_York')
  })
})

describe('shouldInjectCurrentDatetime', () => {
  beforeEach(() => {
    clearDatetimeInjectionState()
  })

  it('injects when there is no previous datetime context', () => {
    expect(
      shouldInjectCurrentDatetime([{ role: 'user', content: 'hello' }], {
        now: new Date('2026-06-20T12:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe(true)
  })

  it('skips when the outgoing batch already contains the datetime block', () => {
    const messages = [
      buildInjectorUserMessage(
        'current-datetime',
        formatCurrentDatetimeInstructionBlock({
          now: new Date('2026-06-20T08:00:00.000Z'),
        }),
        '2026-06-20T08:00:00.000Z',
      ),
    ]
    expect(
      shouldInjectCurrentDatetime(messages, {
        now: new Date('2026-06-20T20:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe(false)
  })

  it('injects again for a new user turn on the same day', () => {
    recordDatetimeInjection('conv-1', {
      userMessageId: 'user-1',
      userMessageAt: '2026-06-20T08:00:00.000Z',
      dayKey: '2026-06-20',
      injectedAt: '2026-06-20T08:00:01.000Z',
    })

    expect(
      shouldInjectCurrentDatetime(
        [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'ok' },
          { role: 'user', content: 'second' },
        ],
        {
          conversationId: 'conv-1',
          latestUserMessageId: 'user-2',
          latestUserMessageAt: '2026-06-20T09:00:00.000Z',
          now: new Date('2026-06-20T09:00:01.000Z'),
          timeZone: 'UTC',
        },
      ),
    ).toBe(true)
  })

  it('skips when the same user turn is prepared again', () => {
    recordDatetimeInjection('conv-1', {
      userMessageId: 'user-1',
      userMessageAt: '2026-06-20T08:00:00.000Z',
      dayKey: '2026-06-20',
      injectedAt: '2026-06-20T08:00:01.000Z',
    })

    expect(
      shouldInjectCurrentDatetime([{ role: 'user', content: 'hello' }], {
        conversationId: 'conv-1',
        latestUserMessageId: 'user-1',
        latestUserMessageAt: '2026-06-20T08:00:00.000Z',
        now: new Date('2026-06-20T08:00:05.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe(false)
  })

  it('injects on a new calendar day even for the same user message id', () => {
    recordDatetimeInjection('conv-1', {
      userMessageId: 'user-1',
      userMessageAt: '2026-06-19T23:59:00.000Z',
      dayKey: '2026-06-19',
      injectedAt: '2026-06-19T23:59:01.000Z',
    })

    expect(
      shouldInjectCurrentDatetime([{ role: 'user', content: 'hello' }], {
        conversationId: 'conv-1',
        latestUserMessageId: 'user-1',
        now: new Date('2026-06-20T00:05:01.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe(true)
  })

  it('falls back to calendar day when turn identity is unavailable', () => {
    recordDatetimeInjection('conv-1', {
      userMessageId: 'user-1',
      dayKey: '2026-06-20',
      injectedAt: '2026-06-20T08:00:01.000Z',
    })

    expect(
      shouldInjectCurrentDatetime([{ role: 'user', content: 'hello' }], {
        conversationId: 'conv-1',
        now: new Date('2026-06-20T09:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe(false)
  })
})
