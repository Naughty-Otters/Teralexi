import { describe, expect, it } from 'vitest'
import { DEFAULT_CHAT_UI_SETTINGS } from '@shared/agent/chat-ui-settings'
import { buildHistoryModelMessages } from './conversation-history-messages'

describe('buildHistoryModelMessages', () => {
  it('uses the shared default context window size', () => {
    const messageCount = DEFAULT_CHAT_UI_SETTINGS.contextWindowMessages + 10
    const messages = Array.from({ length: messageCount }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message-${i}`,
    }))
    const out = buildHistoryModelMessages(messages)
    expect(out).toHaveLength(DEFAULT_CHAT_UI_SETTINGS.contextWindowMessages)
    expect(out[0].content).toBe(
      `message-${messageCount - DEFAULT_CHAT_UI_SETTINGS.contextWindowMessages}`,
    )
  })

  it('maps user and assistant turns with truncation window', () => {
    const messages = Array.from({ length: 12 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message-${i}`,
    }))
    const out = buildHistoryModelMessages(messages, { maxMessages: 4 })
    expect(out).toHaveLength(4)
    expect(out[0].content).toBe('message-8')
    expect(out[3].content).toBe('message-11')
  })
})
