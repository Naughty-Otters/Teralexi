import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AgentPlanModeState } from '@shared/agent/plan-mode'
import { explorePhaseTodoUpdateBlockedReason } from './plan-mode-todo-update-guard'

const { planState } = vi.hoisted(() => {
  const planState: AgentPlanModeState = {
    status: 'tool_execute',
    planSlug: null,
  }
  return { planState }
})

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    getConversationPlanModeState: vi.fn(() => ({ ...planState })),
    setConversationPlanModeState: vi.fn(
      (_id: string, next: AgentPlanModeState) => {
        Object.assign(planState, next)
      },
    ),
  })),
}))

describe('explorePhaseTodoUpdateBlockedReason', () => {
  beforeEach(() => {
    Object.assign(planState, { status: 'tool_execute', planSlug: null })
  })

  it('allows completed todos during normal execution', () => {
    expect(
      explorePhaseTodoUpdateBlockedReason('conv-1', [
        { content: 'Done', status: 'completed' },
      ]),
    ).toBeNull()
  })

  it('blocks completed todos while exploring', () => {
    planState.status = 'planning'
    const reason = explorePhaseTodoUpdateBlockedReason('conv-1', [
      { content: 'Draft step', status: 'completed' },
    ])
    expect(reason).toContain('Exploring')
    expect(reason).toContain('exit_plan_mode')
  })

  it('allows pending and in_progress while exploring', () => {
    planState.status = 'planning'
    expect(
      explorePhaseTodoUpdateBlockedReason('conv-1', [
        { content: 'Step one', status: 'pending' },
        { content: 'Step two', status: 'in_progress' },
      ]),
    ).toBeNull()
  })

  it('allows completed todos during plan_tool_execute', () => {
    planState.status = 'plan_tool_execute'
    expect(
      explorePhaseTodoUpdateBlockedReason('conv-1', [
        { content: 'Done', status: 'completed' },
      ]),
    ).toBeNull()
  })
})
