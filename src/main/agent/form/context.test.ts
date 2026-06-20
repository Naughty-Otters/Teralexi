import { describe, expect, it, vi } from 'vitest'
import { ReferenceContext } from '../resources/context'
import { ReferenceDoc } from '../types'

vi.mock('./collect-data-step', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./collect-data-step')>()
  return {
    ...actual,
    CollectFormDataStep: class {
      maybePauseForFormBeforeTodoExecution = vi.fn(async () => true)
    },
  }
})

import { FormContext } from './context'

describe('FormContext', () => {
  const references = new ReferenceContext()
  const host = {
    references,
    collectedFormByTodoId: {} as Record<number, Record<string, unknown>>,
    clientUiMessages: [
      {
        id: 'a1',
        role: 'assistant' as const,
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
        role: 'user' as const,
        parts: [
          {
            type: 'data-collect-form-response',
            id: 'fid',
            data: { values: { field: 'v' } },
          },
        ],
      },
    ],
  }

  const ctx = new FormContext(host)

  it('delegates form doc helpers to collect-data-step exports', () => {
    const doc = new ReferenceDoc('form/step.form.md')
    expect(
      ctx.referenceDocIsCollectFormSchemaDoc(doc, { form_doc_name: 'step.form.md' } as never),
    ).toBe(true)
    expect(
      ctx.resolveFormDocName({ form_doc_name: 'step.form.md' } as never, [doc]),
    ).toBe('step.form.md')
    expect(ctx.findFormReferenceDoc([doc], 'step.form.md')).toBe(doc)
  })

  it('delegates UI message helpers', () => {
    expect(ctx.uiMessagesIndicateFormCollectionResume()).toBe(true)
    expect(ctx.findCollectFormRequestMeta('fid')).toEqual({
      todoId: 1,
      todoName: 'Step',
    })
    expect(ctx.extractCollectFormResponse()).toMatchObject({
      requestId: 'fid',
      values: { field: 'v' },
    })
    expect(ctx.formValuesProvidedByClientRequest(1)).toBe(true)
    expect(ctx.formValuesProvidedByClientRequest(2)).toBe(false)
    const text = ctx.convertCollectFormDataUIPartToText({
      type: 'data-collect-form-response',
      data: { values: { field: 'v' } },
    })
    expect(text?.text).toContain('field')
  })

  it('applyCollectFormResponsesToUiMessages stores values on host map', () => {
    const map: Record<number, Record<string, unknown>> = {}
    const localHost = { ...host, collectedFormByTodoId: map }
    const localCtx = new FormContext(localHost)
    expect(localCtx.applyCollectFormResponsesToUiMessages()).toEqual({
      applied: true,
      todoId: 1,
    })
    expect(map[1]).toEqual({ field: 'v' })
  })

  it('maybePauseForFormBeforeTodoExecution loads CollectFormDataStep', async () => {
    const stepCtx = {} as never
    await expect(
      ctx.maybePauseForFormBeforeTodoExecution(stepCtx, {
        todoItem: { id: 1 } as never,
        reference_doc: [],
        todoIndexInPlan: 0,
        readiness: { sufficient: false, collectViaForm: true },
      }),
    ).resolves.toBe(true)
  })
})
