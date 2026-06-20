import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  resolvePlannedTodoForIndex,
  runTodoItemPrelude,
} from './prelude'
import type { TodoItem } from '../../types'

const assessTodoFormReadiness = vi.fn()

vi.mock('../../form/todo-form-readiness', () => ({
  assessTodoFormReadiness: (...args: unknown[]) => assessTodoFormReadiness(...args),
}))

describe('resolvePlannedTodoForIndex', () => {
  it('returns item when planning is missing', () => {
    const item = { id: 1, name: 'A' } as TodoItem
    expect(resolvePlannedTodoForIndex(undefined, item, 0)).toBe(item)
  })
})

describe('runTodoItemPrelude', () => {
  beforeEach(() => {
    assessTodoFormReadiness.mockReset()
    assessTodoFormReadiness.mockResolvedValue({
      sufficient: false,
      collectViaForm: true,
    })
  })

  it('skips readiness when form values already collected', async () => {
    const stepCtx = {
      collectedFormByTodoId: { 1: { field: 'v' } },
      form: {
        applyCollectFormResponsesToUiMessages: vi.fn(),
        maybePauseForFormBeforeTodoExecution: vi.fn(async () => true),
      },
    } as never

    const paused = await runTodoItemPrelude(
      stepCtx,
      { id: 1, reference_doc: [] } as TodoItem,
      0,
    )
    expect(paused).toBe(false)
    expect(assessTodoFormReadiness).not.toHaveBeenCalled()
    expect(stepCtx.form.maybePauseForFormBeforeTodoExecution).not.toHaveBeenCalled()
  })

  it('returns true when readiness requires form collection', async () => {
    const stepCtx = {
      collectedFormByTodoId: {},
      form: {
        applyCollectFormResponsesToUiMessages: vi.fn(),
        maybePauseForFormBeforeTodoExecution: vi.fn(async () => true),
      },
    } as never

    const paused = await runTodoItemPrelude(
      stepCtx,
      { id: 1, reference_doc: [] } as TodoItem,
      0,
    )
    expect(paused).toBe(true)
    expect(assessTodoFormReadiness).toHaveBeenCalled()
    expect(stepCtx.form.maybePauseForFormBeforeTodoExecution).toHaveBeenCalledWith(
      stepCtx,
      expect.objectContaining({
        readiness: { sufficient: false, collectViaForm: true },
      }),
    )
  })

  it('returns false when readiness is sufficient', async () => {
    assessTodoFormReadiness.mockResolvedValue({
      sufficient: true,
      collectViaForm: false,
    })
    const stepCtx = {
      collectedFormByTodoId: {},
      form: {
        applyCollectFormResponsesToUiMessages: vi.fn(),
        maybePauseForFormBeforeTodoExecution: vi.fn(
          async (_ctx, params: { readiness: { collectViaForm: boolean } }) =>
            params.readiness.collectViaForm,
        ),
      },
    } as never

    const paused = await runTodoItemPrelude(
      stepCtx,
      { id: 1, reference_doc: [] } as TodoItem,
      0,
    )
    expect(paused).toBe(false)
    expect(stepCtx.form.maybePauseForFormBeforeTodoExecution).toHaveBeenCalledWith(
      stepCtx,
      expect.objectContaining({
        readiness: { sufficient: true, collectViaForm: false },
      }),
    )
  })
})
