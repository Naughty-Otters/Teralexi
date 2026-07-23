import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  PLAN_MODE_USER_TRIGGERS,
  exitPlanReminder,
  fullPlanReminder,
  planExecutionContinuationReminder,
  reentryPlanReminder,
  resolvePlanModeInstructionBlock,
  resolvePlanModeInjectionMessage,
  resolvePlanModeInjectionSlice,
} from './plan-mode-injection-content'
import {
  markExecuteContinuationReminder,
  resetAllPlanRemindersForTests,
} from './plan-mode-session-reminders'

vi.mock('./coding-agent-policy', () => ({
  getCodingModeForConversation: vi.fn(() => 'normal'),
}))

vi.mock('./plan-mode-state', () => ({
  consumePendingPlanActivation: vi.fn(() => false),
  consumePendingPlanExecution: vi.fn(() => false),
  hasPendingPlanActivation: vi.fn(() => false),
  hasPendingPlanExecution: vi.fn(() => false),
  getPlanModeStateForConversation: vi.fn(() => ({
    status: 'tool_execute',
    planSlug: null,
  })),
  isPlanFileWritten: vi.fn(() => false),
  resolvePlanModeStorage: vi.fn(() => null),
}))

vi.mock('./plan-mode-storage-impl', () => ({
  readPlanModeTodoList: vi.fn(() => ({ todos: [] })),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}))

import { getCodingModeForConversation } from './coding-agent-policy'
import {
  consumePendingPlanActivation,
  consumePendingPlanExecution,
  getPlanModeStateForConversation,
  hasPendingPlanActivation,
  hasPendingPlanExecution,
  isPlanFileWritten,
  resolvePlanModeStorage,
} from './plan-mode-state'
import { readPlanModeTodoList } from './plan-mode-storage-impl'
import { existsSync } from 'node:fs'

describe('plan-mode-injection-content', () => {
  beforeEach(() => {
    resetAllPlanRemindersForTests()
    vi.mocked(getPlanModeStateForConversation).mockReturnValue({
      status: 'tool_execute',
      planSlug: null,
    })
    vi.mocked(consumePendingPlanActivation).mockReturnValue(false)
    vi.mocked(consumePendingPlanExecution).mockReturnValue(false)
    vi.mocked(hasPendingPlanActivation).mockReturnValue(false)
    vi.mocked(hasPendingPlanExecution).mockReturnValue(false)
    vi.mocked(getCodingModeForConversation).mockReturnValue('normal')
    vi.mocked(resolvePlanModeStorage).mockReturnValue(null)
    vi.mocked(isPlanFileWritten).mockReturnValue(false)
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(readPlanModeTodoList).mockReturnValue({ todos: [] })
  })

  it('exports full plan reminders for instructions', () => {
    expect(fullPlanReminder('/plans/foo.md', false, false)).toContain('Explore mode is active')
    expect(fullPlanReminder('/plans/foo.md', true, false)).toContain(
      'update_todos',
    )
    expect(fullPlanReminder('/plans/foo.md', false, false)).toContain('update_todos')
    expect(fullPlanReminder('/plans/foo.md', false, false)).toContain('chat/reasoning does NOT count')
    expect(reentryPlanReminder('/plans/foo.md')).toContain('re-entry')
    expect(reentryPlanReminder('/plans/foo.md')).toContain('update_todos')
    expect(exitPlanReminder()).toContain('one-by-one')
    expect(exitPlanReminder()).toContain('plans/todos.json')
  })

  it('injects enter instruction block when plan mode is active at loop start', () => {
    vi.mocked(getPlanModeStateForConversation).mockReturnValue({
      status: 'planning',
      planSlug: 'my-plan',
    })

    const block = resolvePlanModeInstructionBlock('conv-1', 0)
    expect(block).toContain('Explore mode is active')
    expect(block).toContain('update_todos')
    expect(consumePendingPlanActivation).not.toHaveBeenCalled()
    expect(consumePendingPlanExecution).not.toHaveBeenCalled()
  })

  it('injects exit instruction block when execution is pending (peek only)', () => {
    vi.mocked(getPlanModeStateForConversation).mockReturnValue({
      status: 'plan_tool_execute',
      planSlug: 'my-plan',
    })
    vi.mocked(hasPendingPlanExecution).mockReturnValue(true)

    const block = resolvePlanModeInstructionBlock('conv-1', 0)
    expect(block).toBe(exitPlanReminder())
    expect(consumePendingPlanExecution).not.toHaveBeenCalled()
  })

  it('injects continuation reminder when unfinished plan todos need another loop', () => {
    vi.mocked(getPlanModeStateForConversation).mockReturnValue({
      status: 'plan_tool_execute',
      planSlug: 'my-plan',
    })
    markExecuteContinuationReminder('conv-1')

    const block = resolvePlanModeInstructionBlock('conv-1', 0)
    expect(block).toBe(planExecutionContinuationReminder())

    const msg = resolvePlanModeInjectionMessage('conv-1', 0)
    expect(msg?.content).toContain(PLAN_MODE_USER_TRIGGERS.executeContinuation)
  })

  it('wraps short user triggers for post-approval execution phase', () => {
    vi.mocked(getPlanModeStateForConversation).mockReturnValue({
      status: 'plan_tool_execute',
      planSlug: 'p',
    })
    vi.mocked(hasPendingPlanExecution).mockReturnValue(true)
    vi.mocked(consumePendingPlanExecution).mockReturnValue(true)

    const msg = resolvePlanModeInjectionMessage('conv-1', 0)
    expect(msg?.role).toBe('user')
    expect(msg?.content).toContain(PLAN_MODE_USER_TRIGGERS.execute)
    expect(msg?.content).not.toContain('enter plan mode')
    expect(msg?.content).not.toContain('exit plan mode')
  })

  it('uses continue trigger when plan mode is active without pending activation', () => {
    vi.mocked(getPlanModeStateForConversation).mockReturnValue({
      status: 'planning',
      planSlug: 'p',
    })
    vi.mocked(resolvePlanModeStorage).mockReturnValue({
      sandboxRoot: '/tmp/sb',
      plansDirAbs: '/tmp/sb/plans',
      planFile: {
        absolutePath: '/tmp/sb/plans/p.md',
        displayPath: 'plans/p.md',
        slug: 'p',
      },
      todosFile: {
        absolutePath: '/tmp/sb/plans/todos.json',
        displayPath: 'plans/todos.json',
      },
      manifestFile: {
        absolutePath: '/tmp/sb/plans/manifest.json',
        displayPath: 'plans/manifest.json',
      },
    })
    vi.mocked(existsSync).mockReturnValue(true)

    const msg = resolvePlanModeInjectionMessage('conv-1', 0)
    expect(msg?.content).toContain(PLAN_MODE_USER_TRIGGERS.continue)
    expect(msg?.content).not.toContain(PLAN_MODE_USER_TRIGGERS.reenter)
  })

  it('consumes pending activation once in user injection slice', () => {
    vi.mocked(getPlanModeStateForConversation).mockReturnValue({
      status: 'planning',
      planSlug: 'p',
    })
    vi.mocked(hasPendingPlanActivation).mockReturnValue(true)
    vi.mocked(consumePendingPlanActivation).mockReturnValue(true)

    const slice = resolvePlanModeInjectionSlice('conv-1', 3)
    expect(slice?.userTrigger).toBe(PLAN_MODE_USER_TRIGGERS.enter)
    expect(consumePendingPlanActivation).toHaveBeenCalledWith('conv-1')
  })

  it('uses enter not reenter when plan file is template-only', () => {
    vi.mocked(getPlanModeStateForConversation).mockReturnValue({
      status: 'planning',
      planSlug: 'p',
    })
    vi.mocked(hasPendingPlanActivation).mockReturnValue(true)
    vi.mocked(consumePendingPlanActivation).mockReturnValue(true)
    vi.mocked(resolvePlanModeStorage).mockReturnValue({
      sandboxRoot: '/tmp/sb',
      plansDirAbs: '/tmp/sb/plans',
      planFile: {
        absolutePath: '/tmp/sb/plans/p.md',
        displayPath: 'plans/p.md',
        slug: 'p',
      },
      todosFile: {
        absolutePath: '/tmp/sb/plans/todos.json',
        displayPath: 'plans/todos.json',
      },
      manifestFile: {
        absolutePath: '/tmp/sb/plans/manifest.json',
        displayPath: 'plans/manifest.json',
      },
    })
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(isPlanFileWritten).mockReturnValue(false)

    const slice = resolvePlanModeInjectionSlice('conv-1', 0)
    expect(slice?.phase).toBe('enter')
    expect(slice?.userTrigger).toBe(PLAN_MODE_USER_TRIGGERS.enter)
  })

  it('reminds to call exit_plan_mode on continue when plan and todos are ready', () => {
    vi.mocked(getPlanModeStateForConversation).mockReturnValue({
      status: 'planning',
      planSlug: 'p',
    })
    vi.mocked(resolvePlanModeStorage).mockReturnValue({
      sandboxRoot: '/tmp/sb',
      plansDirAbs: '/tmp/sb/plans',
      planFile: {
        absolutePath: '/tmp/sb/plans/p.md',
        displayPath: 'plans/p.md',
        slug: 'p',
      },
      todosFile: {
        absolutePath: '/tmp/sb/plans/todos.json',
        displayPath: 'plans/todos.json',
      },
      manifestFile: {
        absolutePath: '/tmp/sb/plans/manifest.json',
        displayPath: 'plans/manifest.json',
      },
    })
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(isPlanFileWritten).mockReturnValue(true)
    vi.mocked(readPlanModeTodoList).mockReturnValue({
      todos: [{ content: 'Step one', status: 'pending' }],
    })

    const block = resolvePlanModeInstructionBlock('conv-1', 0)
    expect(block).toContain('exit_plan_mode')
    expect(block).toContain('REQUIRED NEXT STEP')
  })

  it('reminds to write plan file on continue when not written', () => {
    vi.mocked(getPlanModeStateForConversation).mockReturnValue({
      status: 'planning',
      planSlug: 'p',
    })
    vi.mocked(resolvePlanModeStorage).mockReturnValue({
      sandboxRoot: '/tmp/sb',
      plansDirAbs: '/tmp/sb/plans',
      planFile: {
        absolutePath: '/tmp/sb/plans/p.md',
        displayPath: 'plans/p.md',
        slug: 'p',
      },
      todosFile: {
        absolutePath: '/tmp/sb/plans/todos.json',
        displayPath: 'plans/todos.json',
      },
      manifestFile: {
        absolutePath: '/tmp/sb/plans/manifest.json',
        displayPath: 'plans/manifest.json',
      },
    })
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(isPlanFileWritten).mockReturnValue(false)

    const block = resolvePlanModeInstructionBlock('conv-1', 0)
    expect(block).toContain('Plan file not written yet')
  })

  it('injects yolo user trigger when yolo mode is on and plan mode is off', () => {
    vi.mocked(getCodingModeForConversation).mockReturnValue('yolo')

    const msg = resolvePlanModeInjectionMessage('conv-1', 0)
    expect(msg?.content).toContain(PLAN_MODE_USER_TRIGGERS.yolo)
  })
})
