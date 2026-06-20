import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ReferenceContext } from '../resources/context'
import {
  assessTodoFormReadiness,
  READINESS_ASSESSMENT_FAILED,
} from './todo-form-readiness'

function makeCtx(streamObjectToStepProgress: ReturnType<typeof vi.fn>) {
  return {
    references: new ReferenceContext(),
    collectedFormByTodoId: { 1: { doc_type: 'excel' } },
    getLatestUserMessageContent: () => 'Create Q1 sales spreadsheet',
    opts: { skillId: 'documents', responseLanguage: undefined, abortSignal: undefined },
    config: {
      withResponseLanguageInstruction: (s: string) => s,
    },
    providers: { streamObjectToStepProgress },
  } as never
}

const todo = {
  id: 2,
  name: 'Collect document parameters',
  description: 'Gather doc type and data source',
  success_criteria: 'Parameters known',
} as never

describe('assessTodoFormReadiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns sufficient when LLM says inputs are enough', async () => {
    const streamObjectToStepProgress = vi.fn(async () => ({
      output: {
        sufficient: true,
        collectViaForm: false,
        reason: 'User specified excel and title',
      },
    }))
    const result = await assessTodoFormReadiness(makeCtx(streamObjectToStepProgress), {
      todoItem: todo,
      reference_doc: [],
    })
    expect(result).toEqual({
      sufficient: true,
      collectViaForm: false,
      reason: 'User specified excel and title',
    })
  })

  it('forces collectViaForm false when sufficient is true', async () => {
    const streamObjectToStepProgress = vi.fn(async () => ({
      output: { sufficient: true, collectViaForm: true },
    }))
    const result = await assessTodoFormReadiness(makeCtx(streamObjectToStepProgress), {
      todoItem: todo,
      reference_doc: [],
    })
    expect(result.sufficient).toBe(true)
    expect(result.collectViaForm).toBe(false)
  })

  it('returns collectViaForm when LLM says inputs are insufficient', async () => {
    const streamObjectToStepProgress = vi.fn(async () => ({
      output: {
        sufficient: false,
        collectViaForm: true,
        reason: 'doc_type missing',
      },
    }))
    const result = await assessTodoFormReadiness(makeCtx(streamObjectToStepProgress), {
      todoItem: todo,
      reference_doc: [],
    })
    expect(result.sufficient).toBe(false)
    expect(result.collectViaForm).toBe(true)
    expect(result.reason).toBe('doc_type missing')
  })

  it('defaults collectViaForm to true when sufficient is false and flag omitted', async () => {
    const streamObjectToStepProgress = vi.fn(async () => ({
      output: { sufficient: false },
    }))
    const result = await assessTodoFormReadiness(makeCtx(streamObjectToStepProgress), {
      todoItem: todo,
      reference_doc: [],
    })
    expect(result.collectViaForm).toBe(true)
  })

  it('fail-closed on LLM error', async () => {
    const streamObjectToStepProgress = vi.fn(async () => {
      throw new Error('network')
    })
    const result = await assessTodoFormReadiness(makeCtx(streamObjectToStepProgress), {
      todoItem: todo,
      reference_doc: [],
    })
    expect(result).toEqual(READINESS_ASSESSMENT_FAILED)
  })
})
