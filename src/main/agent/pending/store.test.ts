import { describe, expect, it, beforeEach } from 'vitest'
import {
  deletePendingExecution,
  getPendingExecution,
  pendingExecutionStorageKey,
  setPendingExecution,
} from './store'
import type { PendingAgentExecution } from './types'

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

describe('pendingExecutionStorageKey', () => {
  it('builds key from conversation and assistant ids', () => {
    expect(pendingExecutionStorageKey('conv-1', 'msg-2')).toBe('conv-1:msg-2')
  })

  it('returns undefined when ids missing', () => {
    expect(pendingExecutionStorageKey('', 'msg')).toBeUndefined()
    expect(pendingExecutionStorageKey('conv', undefined)).toBeUndefined()
  })
})

describe('pending execution map', () => {
  const key = 'c1:a1'

  beforeEach(() => {
    deletePendingExecution(key)
    deletePendingExecution('c1:a2')
  })

  it('stores and retrieves pending state', () => {
    const state = makePending({ nextTodoIndex: 2 })
    setPendingExecution(key, state)
    expect(getPendingExecution(key)).toEqual(state)
    deletePendingExecution(key)
    expect(getPendingExecution(key)).toBeUndefined()
  })
})
