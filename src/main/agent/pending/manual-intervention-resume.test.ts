import { describe, expect, it } from 'vitest'
import {
  countUserMessages,
  findPendingManualInterventionExecution,
  hasNewUserFollowUpSincePending,
  mergePendingMessagesWithFollowUp,
  resetManualInterventionTodoInStepOutputs,
} from './manual-intervention-resume'
import { setPendingExecution } from './store'
import type { PendingAgentExecution } from './types'

function makePending(
  overrides: Partial<PendingAgentExecution> = {},
): PendingAgentExecution {
  return {
    currentMessages: [{ role: 'user', content: 'Start task' }],
    stepOutputs: {
      planning: {
        finalGoal: 'g',
        expectations: [],
        todoList: [
          {
            id: 1,
            name: 'Task 1',
            description: 'd',
            success_criteria: 'ok',
            fallback_plan: 'manual_intervention',
            status: 'pending',
          },
        ],
      },
    },
    stepContexts: {},
    stepHistory: [],
    nextTodoIndex: 0,
    collectedFormByTodoId: {},
    awaitingManualIntervention: true,
    pendingManualInterventionTodoId: 1,
    ...overrides,
  }
}

describe('manual intervention resume helpers', () => {
  it('findPendingManualInterventionExecution matches conversation prefix', () => {
    setPendingExecution('conv-1:msg-a', makePending())
    setPendingExecution('conv-2:msg-b', makePending({ awaitingManualIntervention: false }))

    const found = findPendingManualInterventionExecution('conv-1')
    expect(found?.storeKey).toBe('conv-1:msg-a')
    expect(found?.pending.awaitingManualIntervention).toBe(true)
  })

  it('hasNewUserFollowUpSincePending detects an added user turn', () => {
    const pending = makePending({
      currentMessages: [{ role: 'user', content: 'Start task' }],
    })
    expect(
      hasNewUserFollowUpSincePending(pending, [
        { role: 'user', content: 'Start task' },
      ]),
    ).toBe(false)
    expect(
      hasNewUserFollowUpSincePending(pending, [
        { role: 'user', content: 'Start task' },
        { role: 'user', content: 'Use approach B instead' },
      ]),
    ).toBe(true)
  })

  it('mergePendingMessagesWithFollowUp appends new user messages', () => {
    const pending = makePending({
      currentMessages: [{ role: 'user', content: 'Start task' }],
    })
    const merged = mergePendingMessagesWithFollowUp(pending, [
      { role: 'user', content: 'Start task' },
      { role: 'user', content: 'Try the API route' },
    ])
    expect(countUserMessages(merged)).toBe(2)
    expect(merged[1]?.content).toBe('Try the API route')
  })

  it('resetManualInterventionTodoInStepOutputs clears failed status', () => {
    const stepOutputs = {
      planning: {
        finalGoal: 'g',
        expectations: [],
        todoList: [
          {
            id: 1,
            name: 'Task 1',
            description: 'd',
            success_criteria: 'ok',
            fallback_plan: 'manual_intervention' as const,
            status: 'failed' as const,
          },
        ],
      },
    }
    resetManualInterventionTodoInStepOutputs(stepOutputs, 0, 1)
    expect(stepOutputs.planning?.todoList[0]?.status).toBe('pending')
  })
})
