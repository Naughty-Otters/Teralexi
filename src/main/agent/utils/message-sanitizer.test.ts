import { describe, expect, it } from 'vitest'
import { sanitizeMessages } from './message-sanitizer'
import type { ModelMessage } from '@teralexi-ai'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function user(content: string): ModelMessage {
  return { role: 'user', content }
}

function assistant(content: string): ModelMessage {
  return { role: 'assistant', content }
}

function assistantWithToolCall(
  toolCallId: string,
  toolName: string,
  input: unknown,
): ModelMessage {
  return {
    role: 'assistant',
    content: [{ type: 'tool-call', toolCallId, toolName, input }],
  }
}

function toolResult(toolCallId: string, toolName: string, output: unknown): ModelMessage {
  return {
    role: 'tool',
    content: [{ type: 'tool-result', toolCallId, toolName, output }],
  }
}

// ---------------------------------------------------------------------------
// Pass 1 — surrogate stripping
// ---------------------------------------------------------------------------

describe('sanitizeMessages — surrogate stripping', () => {
  it('strips lone surrogates from user string content', () => {
    const msg = user('hello\uD800world')
    const { messages, mutations } = sanitizeMessages([msg])
    expect((messages[0] as { content: string }).content).toBe('hello�world')
    expect(mutations).toHaveLength(1)
    expect(mutations[0]).toMatch(/surrogate stripped/)
  })

  it('strips lone surrogates from assistant string content', () => {
    const msg = assistant('text\uDFFF')
    const { messages } = sanitizeMessages([msg])
    expect((messages[0] as { content: string }).content).toBe('text�')
  })

  it('strips surrogates from array text parts in user message', () => {
    const msg: ModelMessage = {
      role: 'user',
      content: [{ type: 'text', text: 'hi\uD83D' }],
    }
    const { messages } = sanitizeMessages([msg])
    const part = ((messages[0] as { content: unknown[] }).content[0]) as { text: string }
    expect(part.text).toBe('hi�')
  })

  it('strips surrogates from assistant text parts', () => {
    const msg: ModelMessage = {
      role: 'assistant',
      content: [{ type: 'text', text: 'ok\uDE00' }],
    }
    const { messages } = sanitizeMessages([msg])
    const part = ((messages[0] as { content: unknown[] }).content[0]) as { text: string }
    expect(part.text).toBe('ok�')
  })

  it('strips surrogates from tool result output strings', () => {
    const msgs: ModelMessage[] = [
      assistantWithToolCall('id1', 'my_tool', {}),
      toolResult('id1', 'my_tool', 'result\uD900'),
    ]
    const { messages } = sanitizeMessages(msgs)
    const toolMsg = messages[1] as { content: Array<{ output: string }> }
    expect(toolMsg.content[0].output).toBe('result�')
  })

  it('leaves clean strings untouched', () => {
    const msgs = [user('clean text'), assistant('also clean')]
    const { messages, mutations } = sanitizeMessages(msgs)
    expect(messages[0]).toBe(msgs[0])
    expect(messages[1]).toBe(msgs[1])
    expect(mutations).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Pass 2 — tool-call input repair
// ---------------------------------------------------------------------------

describe('sanitizeMessages — tool-call input repair', () => {
  it('leaves object input untouched', () => {
    const msg = assistantWithToolCall('tc1', 'my_tool', { key: 'value' })
    const { messages, mutations } = sanitizeMessages([msg])
    expect(messages[0]).toBe(msg)
    expect(mutations).toHaveLength(0)
  })

  it('parses valid JSON string input', () => {
    const msg = assistantWithToolCall('tc1', 'my_tool', '{"key":"value"}')
    const { messages, mutations } = sanitizeMessages([msg])
    const part = ((messages[0] as { content: unknown[] }).content[0]) as { input: unknown }
    expect(part.input).toEqual({ key: 'value' })
    expect(mutations).toHaveLength(1)
  })

  it('repairs trailing-comma JSON', () => {
    const msg = assistantWithToolCall('tc1', 'my_tool', '{"a":1,}')
    const { messages, mutations } = sanitizeMessages([msg])
    const part = ((messages[0] as { content: unknown[] }).content[0]) as { input: unknown }
    expect(part.input).toEqual({ a: 1 })
    expect(mutations[0]).toMatch(/trailing-comma/)
  })

  it('repairs unclosed JSON object', () => {
    const msg = assistantWithToolCall('tc1', 'my_tool', '{"a":1')
    const { messages, mutations } = sanitizeMessages([msg])
    const part = ((messages[0] as { content: unknown[] }).content[0]) as { input: unknown }
    expect(part.input).toEqual({ a: 1 })
    expect(mutations[0]).toMatch(/unclosed/)
  })

  it('falls back to parse-error object for irreparable input', () => {
    const msg = assistantWithToolCall('tc1', 'my_tool', 'not json at all {{{{')
    const { messages, mutations } = sanitizeMessages([msg])
    const part = ((messages[0] as { content: unknown[] }).content[0]) as {
      input: Record<string, unknown>
    }
    expect(part.input._toolInputParseError).toBe(true)
    expect(part.input._rawInput).toContain('not json')
    expect(mutations[0]).toMatch(/irreparable/)
  })
})

// ---------------------------------------------------------------------------
// Pass 3 — role alternation repair
// ---------------------------------------------------------------------------

describe('sanitizeMessages — stray tool message removal', () => {
  it('keeps matched tool message', () => {
    const msgs: ModelMessage[] = [
      user('do it'),
      assistantWithToolCall('tc1', 'my_tool', {}),
      toolResult('tc1', 'my_tool', 'done'),
    ]
    const { messages, mutations } = sanitizeMessages(msgs)
    expect(messages).toHaveLength(3)
    expect(mutations).toHaveLength(0)
  })

  it('drops tool message whose toolCallId has no assistant match', () => {
    const msgs: ModelMessage[] = [
      user('do it'),
      toolResult('orphan-id', 'my_tool', 'done'),
    ]
    const { messages, mutations } = sanitizeMessages(msgs)
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    expect(mutations).toHaveLength(1)
    expect(mutations[0]).toMatch(/stray tool message/)
  })

  it('removes only orphaned results from a partially-matched tool message', () => {
    const msgs: ModelMessage[] = [
      user('do it'),
      assistantWithToolCall('tc1', 'my_tool', {}),
      {
        role: 'tool',
        content: [
          { type: 'tool-result', toolCallId: 'tc1', toolName: 'my_tool', output: 'ok' },
          { type: 'tool-result', toolCallId: 'orphan', toolName: 'other', output: 'nope' },
        ],
      },
    ]
    const { messages, mutations } = sanitizeMessages(msgs)
    expect(messages).toHaveLength(3)
    const toolMsg = messages[2] as { content: Array<{ toolCallId: string }> }
    expect(toolMsg.content).toHaveLength(1)
    expect(toolMsg.content[0].toolCallId).toBe('tc1')
    expect(mutations[0]).toMatch(/orphaned result/)
  })

  it('keeps tool-approval-response rows for HITL resume', () => {
    const msgs: ModelMessage[] = [
      user('run tool'),
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolCallId: 'tc2', toolName: 'risky_tool', input: { path: '/tmp' } },
          {
            type: 'tool-approval-request',
            approvalId: 'ap2',
            toolCallId: 'tc2',
          },
        ],
      },
      {
        role: 'tool',
        content: [{ type: 'tool-approval-response', approvalId: 'ap2', approved: true }],
      },
    ]
    const { messages, mutations } = sanitizeMessages(msgs)
    expect(messages).toHaveLength(3)
    expect(messages[2].role).toBe('tool')
    expect(mutations).toHaveLength(0)
  })
})

describe('sanitizeMessages — consecutive user message merge', () => {
  it('merges two consecutive user string messages', () => {
    const msgs = [user('hello'), user('world'), assistant('ok')]
    const { messages, mutations } = sanitizeMessages(msgs)
    expect(messages).toHaveLength(2)
    expect((messages[0] as { content: string }).content).toBe('hello\n\nworld')
    expect(messages[1].role).toBe('assistant')
    expect(mutations).toHaveLength(1)
    expect(mutations[0]).toMatch(/merged consecutive user/)
  })

  it('does not merge non-consecutive user messages', () => {
    const msgs = [user('hello'), assistant('hi'), user('world')]
    const { messages, mutations } = sanitizeMessages(msgs)
    expect(messages).toHaveLength(3)
    expect(mutations).toHaveLength(0)
  })
})

describe('sanitizeMessages — consecutive assistant message merge', () => {
  it('merges two consecutive assistant string messages', () => {
    const msgs = [user('hello'), assistant('step 1'), assistant('step 2')]
    const { messages, mutations } = sanitizeMessages(msgs)
    expect(messages).toHaveLength(2)
    expect((messages[1] as { content: string }).content).toBe('step 1\n\nstep 2')
    expect(mutations).toHaveLength(1)
    expect(mutations[0]).toMatch(/merged consecutive assistant/)
  })

  it('merges assistant prose with a following tool-call message', () => {
    const msgs = [
      user('run'),
      assistant('planning output'),
      assistantWithToolCall('tc1', 'my_tool', {}),
    ]
    const { messages, mutations } = sanitizeMessages(msgs)
    expect(messages).toHaveLength(2)
    expect(messages[1].role).toBe('assistant')
    expect(Array.isArray(messages[1].content)).toBe(true)
    const parts = messages[1].content as Array<{ type?: string; toolCallId?: string }>
    expect(parts.some((p) => p.type === 'text')).toBe(true)
    expect(parts.some((p) => p.type === 'tool-call' && p.toolCallId === 'tc1')).toBe(
      true,
    )
    expect(mutations).toHaveLength(1)
    expect(mutations[0]).toMatch(/merged consecutive assistant/)
  })
})

// ---------------------------------------------------------------------------
// Pass 4 — empty content normalization
// ---------------------------------------------------------------------------

describe('sanitizeMessages — empty content normalization', () => {
  it('removes messages with empty string content', () => {
    // Pass 3 replaces the empty-prev with non-empty cur; pass 4 is not needed
    const msgs = [user(''), user('real content')]
    const { messages, mutations } = sanitizeMessages(msgs)
    expect(messages).toHaveLength(1)
    expect((messages[0] as { content: string }).content).toBe('real content')
    expect(mutations.some((m) => m.includes('empty') || m.includes('replaced'))).toBe(true)
  })

  it('removes messages with empty array content', () => {
    const msg: ModelMessage = { role: 'assistant', content: [] }
    const { messages, mutations } = sanitizeMessages([msg])
    expect(messages).toHaveLength(0)
    expect(mutations).toHaveLength(1)
  })

  it('keeps messages with non-empty content', () => {
    const msgs = [user('text'), assistant('reply')]
    const { messages, mutations } = sanitizeMessages(msgs)
    expect(messages).toHaveLength(2)
    expect(mutations).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('sanitizeMessages — idempotency', () => {
  it('applying sanitization twice produces same result', () => {
    const msgs: ModelMessage[] = [
      user('hello\uD800world'),
      assistantWithToolCall('tc1', 'my_tool', '{"key":"value"}'),
      toolResult('orphan', 'other', 'data'),
    ]
    const { messages: once } = sanitizeMessages(msgs)
    const { messages: twice } = sanitizeMessages(once)
    expect(twice).toEqual(once)
  })
})
