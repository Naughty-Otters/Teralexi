import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearConversationSession,
  conversationHitlBlocksQueue,
  hitlBlocksQueueEpoch,
  setConversationHitlBlocksQueue,
} from './conversation-chat-session'

const CONV = 'conv-hitl-epoch'

describe('conversationHitlBlocksQueue', () => {
  beforeEach(() => {
    clearConversationSession(CONV)
  })

  it('bumps epoch when block flag changes so Vue can re-evaluate', () => {
    const before = hitlBlocksQueueEpoch.value
    setConversationHitlBlocksQueue(CONV, true)
    expect(conversationHitlBlocksQueue(CONV)).toBe(true)
    expect(hitlBlocksQueueEpoch.value).toBe(before + 1)

    setConversationHitlBlocksQueue(CONV, true)
    expect(hitlBlocksQueueEpoch.value).toBe(before + 1)

    setConversationHitlBlocksQueue(CONV, false)
    expect(conversationHitlBlocksQueue(CONV)).toBe(false)
    expect(hitlBlocksQueueEpoch.value).toBe(before + 2)
  })
})
