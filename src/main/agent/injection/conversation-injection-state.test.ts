import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearDatetimeInjectionState,
  getLastDatetimeInjection,
  recordDatetimeInjection,
} from './conversation-injection-state'

describe('conversation-injection-state', () => {
  beforeEach(() => {
    clearDatetimeInjectionState()
  })

  it('records and reads datetime injection by conversation id', () => {
    recordDatetimeInjection('conv-1', {
      userMessageId: 'user-1',
      userMessageAt: '2026-06-20T08:00:00.000Z',
      dayKey: '2026-06-20',
      injectedAt: '2026-06-20T08:00:01.000Z',
    })

    expect(getLastDatetimeInjection('conv-1')).toEqual({
      userMessageId: 'user-1',
      userMessageAt: '2026-06-20T08:00:00.000Z',
      dayKey: '2026-06-20',
      injectedAt: '2026-06-20T08:00:01.000Z',
    })
  })
})
