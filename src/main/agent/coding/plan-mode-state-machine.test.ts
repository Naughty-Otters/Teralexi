import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AgentPlanModeState } from '@shared/agent/plan-mode'
import { PlanModeStateMachine, planModeFor, transitionPlanMode } from './plan-mode-state-machine'
import { resetAllPlanRemindersForTests } from './plan-mode-session-reminders'

const { planState, logInfo } = vi.hoisted(() => {
  const planState: AgentPlanModeState = {
    status: 'tool_execute',
    planSlug: null,
  }
  const logInfo = vi.fn()
  return { planState, logInfo }
})

vi.mock('@main/logger', () => ({
  createLogger: vi.fn(() => ({
    info: logInfo,
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

const { notifyPlanModeStateChanged } = vi.hoisted(() => ({
  notifyPlanModeStateChanged: vi.fn(),
}))

vi.mock('@main/services/plan-mode-state-notify', () => ({
  notifyPlanModeStateChanged,
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    getConversationPlanModeState: vi.fn(() => ({ ...planState })),
    setConversationPlanModeState: vi.fn(
      (_id: string, next: AgentPlanModeState) => {
        Object.assign(planState, next)
        return { planModeState: next }
      },
    ),
  })),
}))

describe('PlanModeStateMachine', () => {
  beforeEach(() => {
    logInfo.mockClear()
    notifyPlanModeStateChanged.mockClear()
    resetAllPlanRemindersForTests()
    Object.assign(planState, {
      status: 'tool_execute',
      planSlug: null,
    })
  })

  it('starts in tool_execute', () => {
    const sm = planModeFor('conv-1')
    expect(sm.status).toBe('tool_execute')
    expect(sm.isIdle()).toBe(true)
  })

  it('activatePlanning enters read-only planning', () => {
    const view = planModeFor('conv-1').activatePlanning()
    expect(view.status).toBe('planning')
    expect(planState.status).toBe('planning')
    expect(planModeFor('conv-1').hasPendingEnterReminder()).toBe(true)
    expect(notifyPlanModeStateChanged).toHaveBeenCalledWith('conv-1', view)
  })

  it('activateExecution leaves planning and starts execution', () => {
    planState.status = 'planning'
    const view = planModeFor('conv-1').activateExecution()
    expect(view.status).toBe('plan_tool_execute')
    expect(planState.status).toBe('plan_tool_execute')
    expect(planModeFor('conv-1').hasPendingExecuteReminder()).toBe(true)
  })

  it('activatePlanning clears an in-flight execution phase', () => {
    planState.status = 'plan_tool_execute'
    planModeFor('conv-1').activatePlanning()
    expect(planState.status).toBe('planning')
  })

  it('deactivateExecution returns to tool_execute', () => {
    planState.status = 'plan_tool_execute'
    const view = planModeFor('conv-1').deactivateExecution()
    expect(view.status).toBe('tool_execute')
    expect(planState.status).toBe('tool_execute')
  })

  it('resetToIdle clears status and slug', () => {
    Object.assign(planState, {
      status: 'planning',
      planSlug: 'my-plan',
    })
    const view = planModeFor('conv-1').resetToIdle()
    expect(view).toEqual({ status: 'tool_execute', planSlug: null })
    expect(planState.status).toBe('tool_execute')
    expect(planState.planSlug).toBeNull()
  })

  it('consumeEnterReminder is one-shot', () => {
    planModeFor('conv-1').activatePlanning()
    const sm = planModeFor('conv-1')
    expect(sm.consumeEnterReminder()).toBe(true)
    expect(sm.consumeEnterReminder()).toBe(false)
  })

  it('transitionPlanMode dispatches semantic actions', () => {
    expect(transitionPlanMode('conv-1', 'activatePlanning').status).toBe(
      'planning',
    )
    expect(transitionPlanMode('conv-1', 'activateExecution').status).toBe(
      'plan_tool_execute',
    )
    expect(transitionPlanMode('conv-1', 'resetToIdle').status).toBe('tool_execute')
  })

  it('logs status transitions with trigger metadata', () => {
    planModeFor('conv-1').activatePlanning({
      trigger: 'test:activatePlanning',
      reason: 'unit test',
    })

    expect(logInfo).toHaveBeenCalledWith(
      'Explore mode status transition',
      expect.objectContaining({
        conversationId: 'conv-1',
        trigger: 'test:activatePlanning',
        reason: 'unit test',
        fromStatus: 'tool_execute',
        toStatus: 'planning',
      }),
    )
  })

  it('assignPlanSlug persists slug without changing status', () => {
    planModeFor('conv-1').assignPlanSlug('auth-refactor')
    expect(planState.planSlug).toBe('auth-refactor')
    expect(planModeFor('conv-1').status).toBe('tool_execute')
  })
})
