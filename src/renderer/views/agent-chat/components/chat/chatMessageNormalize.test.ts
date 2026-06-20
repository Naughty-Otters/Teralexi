import { describe, expect, it } from 'vitest'
import type { UIMessage } from '@openfde-ai'
import {
  incrementalSyncChatMessages,
  mergeAssistantMessageFromStore,
  mergeLiveChatMessagesWithStore,
  normalizeChatMessagesForDisplay,
} from './chatMessageNormalize'

describe('mergeLiveChatMessagesWithStore', () => {
  it('keeps step-progress parts when store only has persisted text', () => {
    const live: UIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'data-agent-step-progress',
            id: 'thinking-1',
            data: {
              stepId: 'thinking',
              title: 'Thinking',
              content: 'Analyzing…',
              status: 'completed',
            },
          },
        ],
      },
    ]
    const store: UIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: '{"version":2,"assistantContent":{"outer":{"finalResult":"","report":""},"subSteps":[]}}',
            state: 'done',
          },
        ],
      },
    ]

    const merged = mergeLiveChatMessagesWithStore(live, store)
    expect(merged).toHaveLength(1)
    expect(merged[0]?.parts.some((p) => p.type === 'text')).toBe(true)
    expect(
      merged[0]?.parts.some((p) => p.type === 'data-agent-step-progress'),
    ).toBe(true)
  })

  it('retains live assistant rows missing from store', () => {
    const live: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi', state: 'done' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'data-agent-step-progress',
            id: 'run-1',
            data: { content: 'Working', status: 'running' },
          },
        ],
      },
    ]
    const store: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi', state: 'done' }] },
    ]

    const merged = mergeLiveChatMessagesWithStore(live, store)
    expect(merged.map((m) => m.id)).toEqual(['u1', 'a1'])
  })
})

describe('mergeAssistantMessageFromStore', () => {
  it('preserves interleaved tool and step-progress order from live rows', () => {
    const merged = mergeAssistantMessageFromStore(
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'data-agent-step-progress',
            id: 'toolLoop-1',
            data: {
              stepId: 'toolLoop',
              title: 'Agentic Run',
              sequence: 1,
              content: 'Loop one',
            },
          },
          {
            type: 'tool-grep',
            state: 'output-available',
            toolCallId: 'call-1',
            input: {},
            output: { resultType: 'raw', content: 'x' },
          },
          {
            type: 'data-agent-step-progress',
            id: 'toolLoop-2',
            data: {
              stepId: 'toolLoop',
              title: 'Agentic Run',
              sequence: 2,
              content: 'Loop two',
            },
          },
          { type: 'text', text: 'live', state: 'streaming' },
        ],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'final payload', state: 'done' }],
      },
    )

    expect(merged.parts.map((part) => part.type)).toEqual([
      'data-agent-step-progress',
      'tool-grep',
      'data-agent-step-progress',
      'text',
    ])
  })

  it('marks streaming text parts as done', () => {
    const merged = mergeAssistantMessageFromStore(
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'partial', state: 'streaming' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'final payload', state: 'done' }],
      },
    )
    const text = merged.parts.find((p) => p.type === 'text')
    expect(text?.type === 'text' && text.text).toBe('final payload')
    expect(text?.type === 'text' && text.state).toBe('done')
  })
})

describe('incrementalSyncChatMessages', () => {
  it('patches only the tail assistant row during streaming', () => {
    const base: UIMessage[] = [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'hi', state: 'done' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'hel', state: 'streaming' }],
      },
    ]
    const normalized = normalizeChatMessagesForDisplay(base)
    const raw: UIMessage[] = [
      base[0],
      {
        ...base[1],
        parts: [{ type: 'text', text: 'hello', state: 'streaming' }],
      },
    ]
    const next = incrementalSyncChatMessages(raw, normalized)
    expect(next).toHaveLength(2)
    expect(next[0]).toBe(normalized[0])
    const tail = next[1]?.parts[0]
    expect(tail?.type === 'text' && tail.text).toBe('hello')
  })

  it('falls back to full normalize when message count changes', () => {
    const prev = normalizeChatMessagesForDisplay([
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'one', state: 'streaming' }],
      },
    ])
    const raw: UIMessage[] = [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'new', state: 'done' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'two', state: 'streaming' }],
      },
    ]
    const next = incrementalSyncChatMessages(raw, prev)
    expect(next).toHaveLength(2)
    expect(next[1]?.parts[0]).toMatchObject({ text: 'two' })
  })
})
