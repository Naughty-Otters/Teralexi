import { describe, expect, it, beforeEach } from 'vitest'
import {
  deletePendingExecution,
  setPendingExecution,
} from '../pending/store'
import type { PendingAgentExecution } from '../pending/types'
import {
  findPendingFormExecutionByRequestId,
  savePendingFormExecution,
} from './pending-state'

function makePending(overrides: Partial<PendingAgentExecution> = {}): PendingAgentExecution {
  return {
    currentMessages: [{ role: 'user', content: 'hi' }],
    stepOutputs: {},
    stepContexts: {},
    stepHistory: [],
    nextTodoIndex: 0,
    collectedFormByTodoId: {},
    ...overrides,
  }
}

describe('findPendingFormExecutionByRequestId', () => {
  const key = 'c1:a1'

  beforeEach(() => {
    deletePendingExecution(key)
    deletePendingExecution('c1:a2')
  })

  it('finds pending by form request id within conversation', () => {
    setPendingExecution(key, makePending({ pendingFormRequestId: 'form-99' }))
    setPendingExecution('c1:a2', makePending({ pendingFormRequestId: 'other' }))

    const found = findPendingFormExecutionByRequestId('c1', 'form-99')
    expect(found?.storeKey).toBe(key)
    expect(found?.pending.pendingFormRequestId).toBe('form-99')
  })

  it('returns undefined when conversation or request id empty', () => {
    expect(findPendingFormExecutionByRequestId('', 'x')).toBeUndefined()
    expect(findPendingFormExecutionByRequestId('c1', '')).toBeUndefined()
  })
})

describe('savePendingFormExecution', () => {
  it('persists pending form state when conversation and assistant ids exist', () => {
    const key = 'c1:a1'
    deletePendingExecution(key)

    const saved = savePendingFormExecution(
      {
        opts: { conversationId: 'c1', assistantMessageId: 'a1' },
        currentMessages: [{ role: 'user', content: 'hi' }],
        stepOutputs: {},
        stepContexts: new Map(),
        stepHistory: [],
        collectedFormByTodoId: { 1: { tag: 'life' } },
      } as never,
      {
        nextTodoIndex: 1,
        pendingFormRequestId: 'form-req',
        pendingFormTodoId: 2,
      },
    )

    expect(saved).toBe(true)
    const found = findPendingFormExecutionByRequestId('c1', 'form-req')
    expect(found?.pending.nextTodoIndex).toBe(1)
    expect(found?.pending.pendingFormTodoId).toBe(2)
    expect(found?.pending.collectedFormByTodoId[1]).toEqual({ tag: 'life' })
  })

  it('returns false when storage key cannot be built', () => {
    expect(
      savePendingFormExecution(
        { opts: {}, currentMessages: [], stepOutputs: {}, stepContexts: new Map(), stepHistory: [], collectedFormByTodoId: {} } as never,
        {
          nextTodoIndex: 0,
          pendingFormRequestId: 'x',
          pendingFormTodoId: 1,
        },
      ),
    ).toBe(false)
  })
})
