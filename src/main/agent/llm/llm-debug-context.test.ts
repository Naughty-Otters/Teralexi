import { describe, expect, it } from 'vitest'
import { buildContextAfter, buildContextBefore } from './llm-debug-context'

describe('llm-debug-context', () => {
  it('buildContextBefore snapshots instructions and messages', () => {
    const snap = buildContextBefore({
      instructions: 'Be helpful',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(snap.instructions).toBe('Be helpful')
    expect(snap.messages).toHaveLength(1)
    expect(snap.meta.messageCount).toBe(1)
  })

  it('buildContextAfter appends assistant text', () => {
    const snap = buildContextAfter({
      messagesBefore: [{ role: 'user', content: 'hi' }],
      assistantText: 'hello',
    })
    expect(snap.messages).toHaveLength(2)
    expect(snap.messages[1]).toEqual({ role: 'assistant', content: 'hello' })
  })

  it('buildContextAfter appends tool-call and tool-result messages in order', () => {
    const snap = buildContextAfter({
      messagesBefore: [{ role: 'user', content: 'read a.ts' }],
      toolCalls: [
        {
          order: 1,
          id: 'c1',
          name: 'read_file',
          input: { path: 'a.ts' },
          output: 'body',
          status: 'completed',
        },
        {
          order: 2,
          id: 'c2',
          name: 'grep_files',
          input: { q: 'x' },
          error: 'fail',
          status: 'error',
        },
      ],
      assistantText: 'done',
    })
    expect(snap.messages).toHaveLength(5)
    expect(snap.meta.toolCallCount).toBe(2)
    expect(snap.messages[1]).toMatchObject({ role: 'assistant' })
    expect(snap.messages[2]).toMatchObject({ role: 'tool' })
    expect(snap.messages[4]).toEqual({ role: 'assistant', content: 'done' })
  })
})
