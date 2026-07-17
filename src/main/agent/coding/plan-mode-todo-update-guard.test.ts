import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { AgentPlanModeState } from '@shared/agent/plan-mode'
import { replaceTodos } from '@shared/agent/todos'
import {
  resetActivePlanTodoContentForTests,
  setActivePlanTodoContent,
} from './active-plan-todo'
import {
  explorePhaseTodoUpdateBlockedReason,
  resolveTodoListUpdate,
} from './plan-mode-todo-update-guard'

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

describe('resolveTodoListUpdate', () => {
  beforeEach(() => {
    Object.assign(planState, { status: 'tool_execute', planSlug: null })
    resetActivePlanTodoContentForTests()
  })

  afterEach(() => {
    resetActivePlanTodoContentForTests()
  })

  it('full-replaces while exploring', () => {
    planState.status = 'planning'
    const existing = replaceTodos([
      { content: 'Old step', status: 'pending' },
    ])
    const result = resolveTodoListUpdate({
      conversationId: 'conv-1',
      existing,
      incoming: [{ content: 'New draft step', status: 'pending' }],
    })
    expect(result).toMatchObject({
      ok: true,
      list: { todos: [{ content: 'New draft step', status: 'pending' }] },
    })
  })

  it('status-only merges during plan_tool_execute', () => {
    planState.status = 'plan_tool_execute'
    const existing = replaceTodos([
      { content: 'Approved A', status: 'pending' },
      { content: 'Approved B', status: 'pending' },
    ])
    const result = resolveTodoListUpdate({
      conversationId: 'conv-1',
      existing,
      incoming: [
        { content: 'Approved A', status: 'completed' },
        { content: 'Approved B', status: 'pending' },
      ],
    })
    expect(result).toMatchObject({
      ok: true,
      list: {
        todos: [
          { content: 'Approved A', status: 'completed' },
          { content: 'Approved B', status: 'pending' },
        ],
      },
    })
  })

  it('rejects rewritten steps during plan_tool_execute', () => {
    planState.status = 'plan_tool_execute'
    const existing = replaceTodos([
      { content: 'Approved A', status: 'pending' },
    ])
    const result = resolveTodoListUpdate({
      conversationId: 'conv-1',
      existing,
      incoming: [{ content: 'Invented new step', status: 'in_progress' }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('cannot add or rewrite')
    }
  })

  it('pins status updates to the active foreach todo during plan_tool_execute', () => {
    planState.status = 'plan_tool_execute'
    setActivePlanTodoContent('Approved A')
    const existing = replaceTodos([
      { content: 'Approved A', status: 'pending' },
      { content: 'Approved B', status: 'pending' },
    ])
    const ok = resolveTodoListUpdate({
      conversationId: 'conv-1',
      existing,
      incoming: [{ content: 'Approved A', status: 'in_progress' }],
    })
    expect(ok).toMatchObject({
      ok: true,
      list: {
        todos: [
          { content: 'Approved A', status: 'in_progress' },
          { content: 'Approved B', status: 'pending' },
        ],
      },
    })

    const blocked = resolveTodoListUpdate({
      conversationId: 'conv-1',
      existing,
      incoming: [{ content: 'Approved B', status: 'completed' }],
    })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      expect(blocked.error).toContain('current assigned step')
    }
  })
})
