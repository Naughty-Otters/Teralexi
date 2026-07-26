import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { UIMessage } from '@teralexi-ai'
import {
  syncIncrementalSyncChatMessages,
  syncNormalizeChatMessages,
  resetChatUiWorkerForTests,
} from './chatUiWorkerClient'

function msg(id: string, text: string): UIMessage {
  return {
    id,
    role: 'assistant',
    parts: [{ type: 'text', text, state: 'done' }],
  } as UIMessage
}

describe('chatUiWorkerClient sync fallback', () => {
  beforeEach(() => {
    resetChatUiWorkerForTests()
    vi.stubGlobal('localStorage', {
      getItem: () => 'off',
      setItem: () => {},
      removeItem: () => {},
    })
  })

  afterEach(() => {
    resetChatUiWorkerForTests()
    vi.unstubAllGlobals()
  })

  it('normalizes via sync path when worker is off', () => {
    const raw = [msg('a', 'hello'), msg('a', 'dup')]
    const out = syncNormalizeChatMessages(raw)
    expect(out).toHaveLength(1)
    expect(out[0]?.id).toBe('a')
  })

  it('incremental sync updates the tail message', () => {
    const prev = syncNormalizeChatMessages([msg('a', 'hi')])
    const next = syncIncrementalSyncChatMessages(
      [msg('a', 'hi there')],
      prev,
    )
    expect(next).toHaveLength(1)
    const text = next[0]?.parts.find((p) => p.type === 'text') as {
      text?: string
    }
    expect(text?.text).toContain('hi there')
  })
})
