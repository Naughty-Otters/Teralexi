import { describe, expect, it } from 'vitest'
import {
  applyCollectFormResponsesToUiMessages,
  extractCollectFormResponse,
  findCollectFormRequestMeta,
  formValuesProvidedByClientRequest,
  uiMessagesIndicateFormCollectionResume,
} from './ui'

describe('collect-form-ui re-exports', () => {
  const raw = [
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        {
          type: 'data-collect-form-request',
          id: 'fid',
          data: { todoId: 1, todoName: 'Step' },
        },
      ],
    },
    {
      id: 'u1',
      role: 'user',
      parts: [
        {
          type: 'data-collect-form-response',
          id: 'fid',
          data: { values: { field: 'v' } },
        },
      ],
    },
  ]

  it('parses unknown[] rows via client-ui-messages', () => {
    expect(extractCollectFormResponse(raw)).toMatchObject({
      requestId: 'fid',
      values: { field: 'v' },
      todoId: 1,
    })
    expect(uiMessagesIndicateFormCollectionResume(raw)).toBe(true)
    expect(findCollectFormRequestMeta(raw, 'fid')).toEqual({
      todoId: 1,
      todoName: 'Step',
    })
  })

  it('applies form values to todo map', () => {
    const map: Record<number, Record<string, unknown>> = {}
    expect(applyCollectFormResponsesToUiMessages(map, raw)).toEqual({
      applied: true,
      todoId: 1,
    })
    expect(map[1]).toEqual({ field: 'v' })
  })

  it('formValuesProvidedByClientRequest delegates with parsed messages', () => {
    expect(formValuesProvidedByClientRequest(raw, 1)).toBe(true)
    expect(formValuesProvidedByClientRequest(raw, 2)).toBe(false)
  })
})
