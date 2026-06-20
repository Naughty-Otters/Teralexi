import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AgentPlanModeState } from '@shared/agent/plan-mode'
import { applyPlanExecutionTodoGate } from './plan-mode-execution-todo-gate'

const enterPlanModeBlockedReason = vi.fn(() => null as string | null)

vi.mock('./plan-mode-enter-guard', () => ({
  enterPlanModeBlockedReason: (...args: unknown[]) =>
    enterPlanModeBlockedReason(...args),
}))

const { planState } = vi.hoisted(() => {
  const planState: AgentPlanModeState = {
    status: 'plan_tool_execute',
    planSlug: 'implementation-plan',
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

describe('applyPlanExecutionTodoGate', () => {
  beforeEach(() => {
    Object.assign(planState, {
      status: 'plan_tool_execute',
      planSlug: 'implementation-plan',
    })
    enterPlanModeBlockedReason.mockReturnValue(
      'Approved plan execution is in progress. Do not call enter_plan_mode',
    )
  })

  it('allows update_todos and exit_plan_mode but blocks enter_plan_mode during plan_tool_execute', async () => {
    const updateTodosExecute = vi.fn(async () => ({ ok: true }))
    const exitPlanExecute = vi.fn(async () => ({ ok: true }))
    const enterPlanExecute = vi.fn(async () => ({ ok: true }))
    const readFileExecute = vi.fn(async () => ({ content: 'ok' }))
    const toolSet = {
      update_todos: { execute: updateTodosExecute },
      exit_plan_mode: { execute: exitPlanExecute },
      enter_plan_mode: { execute: enterPlanExecute },
      read_file: { execute: readFileExecute },
    }
    applyPlanExecutionTodoGate(toolSet, 'conv-1')

    await toolSet.update_todos.execute({ todos: [] })
    expect(updateTodosExecute).toHaveBeenCalled()

    await toolSet.exit_plan_mode.execute({ summary: 'done' })
    expect(exitPlanExecute).toHaveBeenCalled()

    const blocked = await toolSet.enter_plan_mode.execute({})
    expect(blocked).toMatchObject({
      error: expect.stringContaining('enter_plan_mode'),
    })
    expect(enterPlanExecute).not.toHaveBeenCalled()

    await toolSet.read_file.execute({ path: 'a.ts' })
    expect(readFileExecute).toHaveBeenCalled()
  })

  it('does not gate enter_plan_mode when guard returns null', async () => {
    enterPlanModeBlockedReason.mockReturnValue(null)
    const enterPlanExecute = vi.fn(async () => ({ ok: true }))
    const toolSet = { enter_plan_mode: { execute: enterPlanExecute } }
    applyPlanExecutionTodoGate(toolSet, 'conv-1')

    await toolSet.enter_plan_mode.execute({})
    expect(enterPlanExecute).toHaveBeenCalled()
  })
})
