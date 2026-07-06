import { describe, expect, it, vi } from 'vitest'
import type { ClientUiMessage } from './client-ui-parse'
import {
  isClientUiMessage,
  cloneClientUiMessages,
  parseClientUiMessages,
} from './client-ui-parse'
import {
  applyCollectFormResponsesToUiMessages,
  extractCollectFormResponse,
  findCollectFormRequestMeta,
  formValuesProvidedByClientRequest,
  uiMessagesIndicateFormCollectionResume,
} from '../form/ui-messages'
import {
  clientUiIndicatesToolApprovalResume,
  extractLastUserForPersistence,
  extractTrailingUserForPersistence,
  findAssistantPartIndexForLatestToolApproval,
  flattenMultipartTextLikeModelMessages,
  sliceClientUiMessagesForToolApprovalContinuation,
} from './client-ui-messages'
import { convertCollectFormDataUIPartToText } from '../form/ui-messages'

vi.mock('@teralexi-ai', () => ({
  convertToModelMessages: vi.fn(async () => []),
}))

function userMsg(
  parts: ClientUiMessage['parts'],
  id = 'u1',
): ClientUiMessage {
  return { id, role: 'user', parts }
}

function assistantMsg(
  parts: ClientUiMessage['parts'],
  id = 'a1',
): ClientUiMessage {
  return { id, role: 'assistant', parts }
}

describe('isClientUiMessage / parseClientUiMessages', () => {
  it('validates message shape', () => {
    expect(isClientUiMessage({ id: '1', role: 'user', parts: [] })).toBe(true)
    expect(isClientUiMessage({ role: 'user', parts: [] })).toBe(false)
    expect(isClientUiMessage(null)).toBe(false)
  })

  it('parses array and skips invalid rows', () => {
    const parsed = parseClientUiMessages([
      { id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      { bad: true },
    ])
    expect(parsed).toHaveLength(1)
    expect(parseClientUiMessages([])).toBeUndefined()
  })
})

describe('collect form helpers (via UI thread)', () => {
  const thread: ClientUiMessage[] = [
    assistantMsg([
      {
        type: 'data-collect-form-request',
        id: 'req-1',
        data: { todoId: 3, todoName: 'Collect' },
      },
    ]),
    userMsg([
      {
        type: 'data-collect-form-response',
        id: 'req-1',
        data: { values: { name: 'Ada' } },
      },
    ]),
  ]

  it('extracts form response with todo id from request meta', () => {
    expect(extractCollectFormResponse(thread)).toEqual({
      requestId: 'req-1',
      values: { name: 'Ada' },
      todoId: 3,
    })
    expect(uiMessagesIndicateFormCollectionResume(thread)).toBe(true)
  })

  it('finds request meta by id', () => {
    expect(findCollectFormRequestMeta(thread, 'req-1')).toEqual({
      todoId: 3,
      todoName: 'Collect',
    })
  })

  it('applies response values to collectedFormByTodoId', () => {
    const collected: Record<number, Record<string, unknown>> = {}
    expect(
      applyCollectFormResponsesToUiMessages(collected, thread),
    ).toEqual({ applied: true, todoId: 3 })
    expect(collected[3]).toEqual({ name: 'Ada' })
  })

  it('formValuesProvidedByClientRequest matches todo id', () => {
    expect(formValuesProvidedByClientRequest(thread, 3)).toBe(true)
    expect(formValuesProvidedByClientRequest(thread, 99)).toBe(false)
  })
})

describe('tool approval slicing', () => {
  it('finds assistant part index at latest approval', () => {
    const parts = [
      { type: 'text', text: 'intro' },
      { type: 'tool-x', toolCallId: 'tc1', state: 'output-available' },
      { type: 'tool-x', toolCallId: 'tc2', state: 'approval-responded' },
    ]
    expect(findAssistantPartIndexForLatestToolApproval(assistantMsg(parts))).toBe(
      2,
    )
  })

  it('starts after a completed tool call from an earlier approval', () => {
    const parts = [
      { type: 'tool-x', toolCallId: 'old', state: 'output-available' },
      { type: 'text', text: 'between' },
      { type: 'tool-x', toolCallId: 'new', state: 'approval-requested' },
    ]
    expect(findAssistantPartIndexForLatestToolApproval(assistantMsg(parts))).toBe(1)
  })

  it('sliceClientUiMessagesForToolApprovalContinuation keeps tool parts in multi-todo mode', () => {
    const messages: ClientUiMessage[] = [
      userMsg([{ type: 'text', text: 'go' }], 'u0'),
      assistantMsg(
        [
          { type: 'text', text: 'working' },
          {
            type: 'dynamic-tool',
            toolCallId: 'tc1',
            state: 'approval-responded',
          },
        ],
        'a0',
      ),
    ]
    const sliced = sliceClientUiMessagesForToolApprovalContinuation(messages, {
      multiTodoPlan: true,
    })
    expect(sliced).toHaveLength(1)
    expect(sliced[0].role).toBe('assistant')
    expect(sliced[0].parts.some((p) => (p as { type?: string }).type === 'text')).toBe(
      false,
    )
  })

  it('sliceClientUiMessagesForToolApprovalContinuation trims prior tools in single-todo mode', () => {
    const messages: ClientUiMessage[] = [
      userMsg([{ type: 'text', text: 'go' }], 'u0'),
      assistantMsg(
        [
          { type: 'text', text: 'working' },
          {
            type: 'dynamic-tool',
            toolCallId: 'old',
            state: 'output-available',
          },
          { type: 'text', text: 'next tool' },
          {
            type: 'dynamic-tool',
            toolCallId: 'new',
            state: 'approval-responded',
          },
        ],
        'a0',
      ),
    ]
    const sliced = sliceClientUiMessagesForToolApprovalContinuation(messages, {
      multiTodoPlan: false,
    })
    expect(sliced).toHaveLength(2)
    expect(sliced[0].role).toBe('user')
    expect(sliced[1].role).toBe('assistant')
    expect(sliced[1].parts).toHaveLength(1)
    expect(sliced[1].parts[0]).toMatchObject({ toolCallId: 'new' })
    expect(
      sliced[1].parts.some((p) => (p as { toolCallId?: string }).toolCallId === 'old'),
    ).toBe(false)
  })

  it('clientUiIndicatesToolApprovalResume detects approval-responded', () => {
    expect(
      clientUiIndicatesToolApprovalResume([
        assistantMsg([{ state: 'approval-responded' } as never]),
      ]),
    ).toBe(true)
    expect(clientUiIndicatesToolApprovalResume([])).toBe(false)
  })

  it('sliceClientUiMessagesForToolApprovalContinuation without pending approval keeps first user only', () => {
    const messages: ClientUiMessage[] = [
      userMsg([{ type: 'text', text: 'first request' }], 'u0'),
      assistantMsg([{ type: 'text', text: 'done with first' }], 'a0'),
      userMsg([{ type: 'text', text: 'second request' }], 'u1'),
    ]
    const sliced = sliceClientUiMessagesForToolApprovalContinuation(messages, {
      multiTodoPlan: false,
    })
    expect(sliced).toHaveLength(1)
    expect(sliced[0].role).toBe('user')
    expect((sliced[0].parts[0] as { text?: string }).text).toBe('first request')
  })
})

describe('extractTrailingUserForPersistence', () => {
  it('extracts text and form response lines', () => {
    const row = extractTrailingUserForPersistence([
      userMsg([
        { type: 'text', text: 'hello' },
        {
          type: 'data-collect-form-response',
          id: 'r1',
          data: { values: { a: 1 } },
        },
      ]),
    ])
    expect(row?.content).toContain('hello')
    expect(row?.content).toContain('data-collect-form-response:r1')
  })
})

describe('extractLastUserForPersistence', () => {
  it('finds the last user row when an assistant placeholder follows', () => {
    const row = extractLastUserForPersistence([
      userMsg([{ type: 'text', text: 'first request' }], 'u1'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: '', state: 'streaming' }],
      },
    ])
    expect(row?.id).toBe('u1')
    expect(row?.content).toBe('first request')
  })
})

describe('convertCollectFormDataUIPartToText', () => {
  it('stringifies data parts', () => {
    expect(
      convertCollectFormDataUIPartToText({
        type: 'data-collect-form-response',
        data: { values: { x: 1 } },
      }),
    ).toEqual({ type: 'text', text: '{"values":{"x":1}}' })
  })

  it('returns undefined for unrelated parts', () => {
    expect(convertCollectFormDataUIPartToText({ type: 'text' })).toBeUndefined()
  })
})

describe('flattenMultipartTextLikeModelMessages', () => {
  it('joins multipart user text', () => {
    const out = flattenMultipartTextLikeModelMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'line1' },
          { type: 'text', text: 'line2' },
        ],
      } as never,
    ])
    expect(out[0]).toMatchObject({ role: 'user', content: 'line1\nline2' })
  })

  it('leaves string content unchanged', () => {
    const msgs = [{ role: 'user', content: 'plain' }] as never[]
    expect(flattenMultipartTextLikeModelMessages(msgs)).toEqual(msgs)
  })

  it('joins assistant text parts and skips reasoning', () => {
    const out = flattenMultipartTextLikeModelMessages([
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'thinking' },
          { type: 'text', text: 'answer' },
        ],
      } as never,
    ])
    expect(out[0]).toMatchObject({ role: 'assistant', content: 'answer' })
  })
})

describe('cloneClientUiMessages', () => {
  it('deep clones messages', () => {
    const src = [userMsg([{ type: 'text', text: 'a' }])]
    const cloned = cloneClientUiMessages(src)!
    cloned[0].parts[0] = { type: 'text', text: 'b' } as never
    expect((src[0].parts[0] as { text?: string }).text).toBe('a')
  })
})
