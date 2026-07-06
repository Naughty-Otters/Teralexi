import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelMessage } from '@teralexi-ai'
import type { StoredMessage } from '@main/services/conversation-store/types'

const listMessagesByThread = vi.fn()
const getMessages = vi.fn()

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    listMessagesByThread,
    getMessages,
  }),
}))

vi.mock('@main/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}))

import {
  injectThreadContext,
  oldestClientUiMessageTimestamp,
  oldestMessageTimestamp,
  resolveEffectiveThreadTag,
  resolveWindowOldestTimestamp,
} from './thread-context-builder'

function stored(
  role: 'user' | 'assistant',
  content: string,
  createdAt: string,
): StoredMessage {
  return {
    id: `m-${content.slice(0, 4)}`,
    conversationId: 'c1',
    agentId: 'a1',
    role,
    content,
    createdAt,
    threadTag: 'auth',
  }
}

describe('injectThreadContext', () => {
  beforeEach(() => {
    listMessagesByThread.mockReset()
  })

  it('skips injection for general tag', () => {
    const existing: ModelMessage[] = [{ role: 'user', content: 'hello' }]
    const result = injectThreadContext(existing, {
      conversationId: 'c1',
      currentTag: 'general',
    })
    expect(result.injectedCount).toBe(0)
    expect(result.messages).toBe(existing)
    expect(listMessagesByThread).not.toHaveBeenCalled()
  })

  it('prepends preamble with correct roles', () => {
    listMessagesByThread.mockReturnValue([
      stored('user', 'login bug', '2020-01-01T00:00:00.000Z'),
      stored('assistant', 'fixed oauth', '2020-01-01T00:01:00.000Z'),
    ])
    const existing: ModelMessage[] = [{ role: 'user', content: 'JWT refresh' }]
    const result = injectThreadContext(existing, {
      conversationId: 'c1',
      currentTag: 'auth',
    })
    expect(result.injectedCount).toBe(2)
    expect(result.messages.length).toBe(3)
    const preamble = result.messages[0]
    expect(preamble.role).toBe('user')
    expect(String(preamble.content)).toContain('User: login bug')
    expect(String(preamble.content)).toContain('Assistant: fixed oauth')
  })

  it('passes windowOldestTs to listByThread', () => {
    listMessagesByThread.mockReturnValue([])
    injectThreadContext([{ role: 'user', content: 'token' }], {
      conversationId: 'c1',
      currentTag: 'auth',
      windowOldestTs: '2024-06-01T12:00:00.000Z',
    })
    expect(listMessagesByThread).toHaveBeenCalledWith('c1', 'auth', {
      before: '2024-06-01T12:00:00.000Z',
      limit: 12,
    })
  })

  it('filters history that overlaps the current window', () => {
    listMessagesByThread.mockReturnValue([
      stored('user', 'same question', '2020-01-01T00:00:00.000Z'),
    ])
    const existing: ModelMessage[] = [{ role: 'user', content: 'same question' }]
    const result = injectThreadContext(existing, {
      conversationId: 'c1',
      currentTag: 'auth',
    })
    expect(result.injectedCount).toBe(0)
    expect(result.messages).toBe(existing)
  })
})

describe('oldestMessageTimestamp', () => {
  it('returns earliest createdAt from message parts', () => {
    const ts = oldestMessageTimestamp([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'a', createdAt: '2024-02-01T00:00:00.000Z' },
        ],
      } as ModelMessage,
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'b', createdAt: '2024-01-01T00:00:00.000Z' },
        ],
      } as ModelMessage,
    ])
    expect(ts).toBe('2024-01-01T00:00:00.000Z')
  })

  it('ignores string-only messages without createdAt', () => {
    expect(
      oldestMessageTimestamp([{ role: 'user', content: 'plain' }]),
    ).toBeUndefined()
  })
})

describe('oldestClientUiMessageTimestamp', () => {
  it('picks the oldest timestamp across UI rows', () => {
    const ts = oldestClientUiMessageTimestamp([
      { createdAt: '2024-03-01T00:00:00.000Z' },
      { metadata: { createdAt: '2024-01-15T00:00:00.000Z' } },
    ])
    expect(ts).toBe('2024-01-15T00:00:00.000Z')
  })
})

describe('resolveWindowOldestTimestamp', () => {
  it('prefers client UI over model messages', () => {
    expect(
      resolveWindowOldestTimestamp(
        [{ createdAt: '2024-05-01T00:00:00.000Z' }],
        [{ role: 'user', content: 'x' }],
      ),
    ).toBe('2024-05-01T00:00:00.000Z')
  })
})

describe('resolveEffectiveThreadTag', () => {
  beforeEach(() => {
    getMessages.mockReset()
  })

  it('returns direct tag for substantive messages', () => {
    expect(
      resolveEffectiveThreadTag('c1', 'Optimize slow database query performance'),
    ).toBe('performance')
  })

  it('inherits prior user thread tag for short affirmatives', () => {
    getMessages.mockReturnValue([
      {
        id: 'u1',
        conversationId: 'c1',
        agentId: 'a1',
        role: 'user',
        content: 'Research Cal High student performance',
        createdAt: '2024-01-01T00:00:00.000Z',
        threadTag: 'performance',
      },
    ])
    expect(resolveEffectiveThreadTag('c1', 'yes')).toBe('performance')
    expect(resolveEffectiveThreadTag('c1', 'please export the PDF')).toBe(
      'performance',
    )
  })

  it('stays general when no prior substantive user turn exists', () => {
    getMessages.mockReturnValue([])
    expect(resolveEffectiveThreadTag('c1', 'yes')).toBe('general')
  })
})
