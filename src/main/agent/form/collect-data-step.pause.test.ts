import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ReferenceContext } from '../resources/context'
import * as collectDataStep from './collect-data-step'
import { CollectFormDataStep } from './collect-data-step'
import { savePendingFormExecution } from './pending-state'

const inferFormValuesFromUserMessage = vi.fn()

const { generateFormSchemaFromContextMock } = vi.hoisted(() => ({
  generateFormSchemaFromContextMock: vi.fn(async () => ({
    title: 'T',
    message: 'Please provide the missing details.',
    fields: [{ key: 'x', label: 'X', type: 'string', required: true }],
  })),
}))

vi.mock('./infer-from-user', () => ({
  inferFormValuesFromUserMessage: (...args: unknown[]) =>
    inferFormValuesFromUserMessage(...args),
}))

vi.mock('./pending-state', () => ({
  savePendingFormExecution: vi.fn(() => true),
}))

vi.mock('./generate-form-schema', () => ({
  GENERATED_FORM_DOC_NAME: 'generated.form.md',
  generateFormSchemaFromContext: (...args: unknown[]) =>
    generateFormSchemaFromContextMock(...args),
  schemaToFormMarkdown: (schema: { fields: unknown[] }) =>
    `<!-- FORM_SCHEMA\n${JSON.stringify(schema)}\n-->`,
}))

function makeStepCtx(overrides: Record<string, unknown> = {}) {
  return {
    references: new ReferenceContext(),
    collectedFormByTodoId: {} as Record<number, Record<string, unknown>>,
    generatedFormSchemaByTodoId: new Map(),
    opts: { skillId: 'documents', conversationId: 'c1', assistantMessageId: 'a1' },
    sandbox: { getRoot: () => '/sandbox' },
    getLatestUserMessageContent: () => 'user message',
    beginStep: vi.fn(),
    recordStepOutput: vi.fn(),
    emitStepProgress: vi.fn(),
    onUIMessageChunk: vi.fn(),
    hitlAwaitingFormData: false,
    form: {
      applyCollectFormResponsesToUiMessages: vi.fn(),
    },
    ...overrides,
  } as never
}

describe('CollectFormDataStep.maybePauseForFormBeforeTodoExecution', () => {
  let resolveSpy: ReturnType<typeof vi.spyOn> | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    resolveSpy = vi
      .spyOn(collectDataStep, 'resolveTodoFormForCollection')
      .mockResolvedValue({
        markdown:
          '<!-- FORM_SCHEMA\n{"fields":[{"key":"x","label":"X","type":"string","required":true}]}\n-->',
        formDocName: 'generated.form.md',
        resolvedForm: {
          title: 'T',
          fields: [{ key: 'x', label: 'X', type: 'string', required: true }],
        },
      })
    inferFormValuesFromUserMessage.mockResolvedValue(null)
  })

  afterEach(() => {
    resolveSpy?.mockRestore()
  })

  it('returns false when readiness.collectViaForm is false', async () => {
    const ctx = makeStepCtx()
    const step = new CollectFormDataStep(ctx)
    const paused = await step.maybePauseForFormBeforeTodoExecution({
      todoItem: {
        id: 1,
        name: 'Step',
        description: 'D',
        form_doc_name: 'doc.form.md',
      } as never,
      reference_doc: [],
      todoIndexInPlan: 0,
      readiness: { sufficient: true, collectViaForm: false },
    })
    expect(paused).toBe(false)
    expect(resolveSpy).not.toHaveBeenCalled()
  })

  it('returns false when inference fills required fields', async () => {
    inferFormValuesFromUserMessage.mockResolvedValue({ x: 'filled' })
    const ctx = makeStepCtx()
    const step = new CollectFormDataStep(ctx)
    const paused = await step.maybePauseForFormBeforeTodoExecution({
      todoItem: { id: 1, name: 'Step', description: 'D' } as never,
      reference_doc: [],
      todoIndexInPlan: 0,
      readiness: { sufficient: false, collectViaForm: true },
    })
    expect(paused).toBe(false)
    expect(ctx.collectedFormByTodoId[1]).toEqual({ x: 'filled' })
  })

  it('pauses and emits dynamic form when inputs are insufficient', async () => {
    const onUIMessageChunk = vi.fn()
    const ctx = makeStepCtx({ opts: { skillId: 'documents', conversationId: 'c1', assistantMessageId: 'a1', onUIMessageChunk } })
    const step = new CollectFormDataStep(ctx)
    const paused = await step.maybePauseForFormBeforeTodoExecution({
      todoItem: { id: 2, name: 'Collect topic', description: 'Need research topic' } as never,
      reference_doc: [],
      todoIndexInPlan: 1,
      readiness: {
        sufficient: false,
        collectViaForm: true,
        reason: 'topic missing',
      },
    })

    expect(paused).toBe(true)
    expect(ctx.hitlAwaitingFormData).toBe(true)
    expect(inferFormValuesFromUserMessage).toHaveBeenCalled()
    expect(savePendingFormExecution).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        nextTodoIndex: 1,
        pendingFormTodoId: 2,
      }),
    )
    expect(onUIMessageChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'data-collect-form-request',
        data: expect.objectContaining({
          todoId: 2,
          todoName: 'Collect topic',
          formDocName: 'generated.form.md',
          fields: [{ key: 'x', label: 'X', type: 'string', required: true }],
        }),
      }),
    )
    expect(ctx.collectedFormByTodoId[2]).toBeUndefined()
  })
})
