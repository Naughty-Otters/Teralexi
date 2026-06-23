import { describe, expect, it } from 'vitest'
import {
  attachInjectorMessageMeta,
  findLastInjectorMessageMeta,
  readInjectorMessageMeta,
  stripInjectorMessageMeta,
} from './injection-message-meta'
import { buildInjectorUserMessage } from './injector'

describe('injection-message-meta', () => {
  it('round-trips injector metadata on user messages', () => {
    const message = buildInjectorUserMessage(
      'current-datetime',
      'Today is Friday',
      '2026-06-20T12:00:00.000Z',
    )
    const meta = readInjectorMessageMeta(message)
    expect(meta).toEqual({
      injectorId: 'current-datetime',
      injectedAt: '2026-06-20T12:00:00.000Z',
    })
  })

  it('finds the latest matching injector message', () => {
    const messages = [
      buildInjectorUserMessage('current-datetime', 'day one', '2026-06-19T12:00:00.000Z'),
      { role: 'user', content: 'hello' },
      buildInjectorUserMessage('current-datetime', 'day two', '2026-06-20T12:00:00.000Z'),
    ] as const

    expect(findLastInjectorMessageMeta(messages, 'current-datetime')).toEqual({
      injectorId: 'current-datetime',
      injectedAt: '2026-06-20T12:00:00.000Z',
    })
  })

  it('strips injector metadata before LLM validation', () => {
    const message = attachInjectorMessageMeta(
      { role: 'user', content: 'hello' },
      { injectorId: 'current-datetime', injectedAt: '2026-06-20T12:00:00.000Z' },
    )
    expect(stripInjectorMessageMeta([message])).toEqual([
      { role: 'user', content: 'hello' },
    ])
  })
})
