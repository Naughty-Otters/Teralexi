import { describe, expect, it } from 'vitest'
import {
  applyCollectFormResponsesToUiMessages,
  convertCollectFormDataUIPartToText,
  extractCollectFormResponse,
  findCollectFormRequestMeta,
  formatCollectFormResponsePersistenceLine,
  formValuesProvidedByClientRequest,
  isCollectFormRequestPart,
  isCollectFormResponsePart,
  uiMessagesIndicateFormCollectionResume,
} from './ui-messages'

describe('ui-messages', () => {
  const requestPart = {
    type: 'data-collect-form-request' as const,
    id: 'req-1',
    data: {
      todoId: 2,
      todoName: 'Confirm',
      title: 'Select a tag',
      message: 'From step 1',
      fields: [{ key: 'tag', label: 'Tag', type: 'select' }],
    },
  }

  const responsePart = {
    type: 'data-collect-form-response' as const,
    id: 'req-1',
    data: { values: { tag: 'life' } },
  }

  const uiMessages = [
    {
      id: 'a1',
      role: 'assistant' as const,
      parts: [requestPart],
    },
    {
      id: 'u1',
      role: 'user' as const,
      parts: [responsePart],
    },
  ]

  it('type guards detect collect-form parts', () => {
    expect(isCollectFormRequestPart(requestPart)).toBe(true)
    expect(isCollectFormResponsePart(responsePart)).toBe(true)
    expect(isCollectFormRequestPart({ type: 'text' })).toBe(false)
  })

  it('findCollectFormRequestMeta returns todo metadata', () => {
    expect(findCollectFormRequestMeta(uiMessages, 'req-1')).toEqual({
      todoId: 2,
      todoName: 'Confirm',
    })
    expect(findCollectFormRequestMeta(uiMessages, '')).toBeUndefined()
  })

  it('extractCollectFormResponse reads latest user response', () => {
    expect(extractCollectFormResponse(uiMessages)).toEqual({
      requestId: 'req-1',
      values: { tag: 'life' },
      todoId: 2,
    })
    expect(uiMessagesIndicateFormCollectionResume(uiMessages)).toBe(true)
  })

  it('extractCollectFormResponse accepts flat data without values wrapper', () => {
    const flat = [
      {
        id: 'u1',
        role: 'user' as const,
        parts: [
          {
            type: 'data-collect-form-response' as const,
            id: 'req-2',
            data: { tag: 'love' },
          },
        ],
      },
    ]
    expect(extractCollectFormResponse(flat)).toEqual({
      requestId: 'req-2',
      values: { tag: 'love' },
      todoId: undefined,
    })
  })

  it('findCollectFormRequestMeta ignores non-string todoName', () => {
    const msgs = [
      {
        id: 'a1',
        role: 'assistant' as const,
        parts: [
          {
            type: 'data-collect-form-request' as const,
            id: 'req-x',
            data: { todoId: 3, todoName: 99 },
          },
        ],
      },
    ]
    expect(findCollectFormRequestMeta(msgs, 'req-x')).toEqual({ todoId: 3 })
  })

  it('applyCollectFormResponsesToUiMessages stores values when todoId present', () => {
    const map: Record<number, Record<string, unknown>> = {}
    expect(applyCollectFormResponsesToUiMessages(map, uiMessages)).toEqual({
      applied: true,
      todoId: 2,
    })
    expect(map[2]).toEqual({ tag: 'life' })
  })

  it('formValuesProvidedByClientRequest matches todo id', () => {
    expect(formValuesProvidedByClientRequest(uiMessages, 2)).toBe(true)
    expect(formValuesProvidedByClientRequest(uiMessages, 9)).toBe(false)
  })

  it('applyCollectFormResponsesToUiMessages warns when todoId missing', () => {
    const map: Record<number, Record<string, unknown>> = {}
    const noTodo = [
      {
        id: 'a1',
        role: 'assistant' as const,
        parts: [{ ...requestPart, data: { todoName: 'x' } }],
      },
      { id: 'u1', role: 'user' as const, parts: [responsePart] },
    ]
    expect(applyCollectFormResponsesToUiMessages(map, noTodo)).toEqual({
      applied: false,
    })
  })

  it('convertCollectFormDataUIPartToText serializes data', () => {
    const text = convertCollectFormDataUIPartToText(responsePart)
    expect(text?.type).toBe('text')
    expect(text?.text).toContain('life')
    expect(convertCollectFormDataUIPartToText({ type: 'text' })).toBeUndefined()
  })

  it('convertCollectFormDataUIPartToText handles other data-collect-form types', () => {
    const requestText = convertCollectFormDataUIPartToText({
      type: 'data-collect-form-request',
      data: { title: 'Hello' },
    })
    expect(requestText?.text).toContain('Hello')
    expect(
      convertCollectFormDataUIPartToText({ type: 'data-collect-form-request' }),
    ).toEqual({ type: 'text', text: '' })
  })

  it('convertCollectFormDataUIPartToText falls back when JSON.stringify fails', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const text = convertCollectFormDataUIPartToText({
      type: 'data-collect-form-response',
      data: circular,
    })
    expect(text?.type).toBe('text')
    expect(text?.text).toContain('[object Object]')
  })

  it('formatCollectFormResponsePersistenceLine includes id and payload', () => {
    const line = formatCollectFormResponsePersistenceLine(responsePart)
    expect(line).toContain('[data-collect-form-response:req-1]')
    expect(line).toContain('"tag":"life"')
  })
})
