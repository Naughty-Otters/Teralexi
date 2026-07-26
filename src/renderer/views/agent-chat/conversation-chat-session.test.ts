import { beforeEach, describe, expect, it } from 'vitest'
import type { UIMessage } from '@teralexi-ai'
import {
  IDLE_CHAT_CACHE_LIMIT,
  clearConversationChatCache,
  evictIdleConversationChats,
  getConversationChat,
  getConversationSnapshot,
  peekConversationSnapshot,
  resetConversationChatSessionForTests,
  setConversationChat,
  syncConversationSnapshot,
} from './conversation-chat-session'

type FakeChat = {
  id: string
  messages: UIMessage[]
}

function makeChat(id: string, text = 'hi'): FakeChat {
  return {
    id,
    messages: [
      {
        id: `${id}-m1`,
        role: 'assistant',
        parts: [{ type: 'text', text, state: 'done' }],
      } as UIMessage,
    ],
  }
}

describe('conversation-chat-session eviction', () => {
  beforeEach(() => {
    resetConversationChatSessionForTests()
  })

  it('evicts idle chats beyond the keep limit while preserving in-flight', () => {
    const active = new Set<string>(['conv-active'])
    setConversationChat(
      'conv-active',
      makeChat('conv-active') as never,
    )
    for (let i = 1; i <= IDLE_CHAT_CACHE_LIMIT + 3; i++) {
      setConversationChat(`conv-${i}`, makeChat(`conv-${i}`) as never)
    }

    evictIdleConversationChats({
      isStreamActive: (id) => active.has(id),
      keepLimit: IDLE_CHAT_CACHE_LIMIT,
    })

    expect(getConversationChat('conv-active')).toBeTruthy()
    let idleLive = 0
    for (let i = 1; i <= IDLE_CHAT_CACHE_LIMIT + 3; i++) {
      if (getConversationChat(`conv-${i}`)) idleLive += 1
    }
    expect(idleLive).toBeLessThanOrEqual(IDLE_CHAT_CACHE_LIMIT)
  })

  it('peekConversationSnapshot returns a read-only snapshot after sync', () => {
    setConversationChat('c1', makeChat('c1', 'x') as never)
    syncConversationSnapshot('c1')
    const peek = peekConversationSnapshot('c1')
    expect(peek?.length).toBe(1)
    clearConversationChatCache('c1')
    // Snapshot cleared with chat cache in clearConversationChatCache.
    expect(peekConversationSnapshot('c1')).toBeUndefined()
  })

  it('soft snapshot keeps the prior clone until get forces refresh', () => {
    const chat = makeChat('c1', 'first')
    setConversationChat('c1', chat as never)
    expect(peekConversationSnapshot('c1')?.[0]).toMatchObject({
      parts: [{ text: 'first' }],
    })

    chat.messages = [
      {
        id: 'c1-m1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'second', state: 'done' }],
      } as UIMessage,
    ]
    syncConversationSnapshot('c1', { clone: false })
    expect(peekConversationSnapshot('c1')?.[0]).toMatchObject({
      parts: [{ text: 'first' }],
    })

    const fresh = getConversationSnapshot('c1')
    expect(fresh?.[0]).toMatchObject({
      parts: [{ text: 'second' }],
    })
  })
})
