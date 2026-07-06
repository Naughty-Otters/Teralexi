import { describe, expect, it } from 'vitest'
import type { UIMessage } from '@teralexi-ai'
import { useStreamingTextBuffer } from './useStreamingTextBuffer'

function assistantMessage(parts: UIMessage['parts']): UIMessage {
  return {
    id: 'a1',
    role: 'assistant',
    parts,
  }
}

describe('useStreamingTextBuffer', () => {
  it('only overrides the actively streaming text part', () => {
    const buffer = useStreamingTextBuffer()
    const msg = assistantMessage([
      { type: 'text', id: 't0', text: 'first step', state: 'done' },
      { type: 'text', id: 't1', text: 'second ', state: 'streaming' },
    ])

    buffer.syncFromMessage(msg)

    expect(buffer.textForMessage(msg, 't0', 'first step')).toBe('first step')
    expect(buffer.textForMessage(msg, 't1', 'second ')).toBe('second ')
  })
})
