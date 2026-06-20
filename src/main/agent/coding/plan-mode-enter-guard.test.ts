import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentPlanModeState } from '@shared/agent/plan-mode'
import { enterPlanModeBlockedReason } from './plan-mode-enter-guard'
import { bootstrapPlanModeStorage } from './plan-mode-state'
import { writePlanModeTodoList } from './plan-mode-storage-impl'
import { replaceTodos } from '@shared/agent/todos'

const { planState } = vi.hoisted(() => {
  const planState: AgentPlanModeState = {
    status: 'tool_execute',
    planSlug: null,
  }
  return { planState }
})

vi.mock('@main/agent/sandbox/run-context', () => ({
  getAgentRunSandboxRoot: vi.fn(() => null as string | null),
}))

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

describe('enterPlanModeBlockedReason', () => {
  let sandboxRoot: string

  beforeEach(() => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'plan-enter-guard-'))
    Object.assign(planState, { status: 'tool_execute', planSlug: 'plan' })
    bootstrapPlanModeStorage('conv-1', 'plan', { sandboxRoot })
  })

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true })
  })

  it('blocks during approved plan execution', () => {
    planState.status = 'plan_tool_execute'
    expect(enterPlanModeBlockedReason('conv-1', { sandboxRoot })).toContain(
      'Approved plan execution is in progress',
    )
  })

  it('blocks when explore mode is already active', () => {
    planState.status = 'planning'
    expect(enterPlanModeBlockedReason('conv-1', { sandboxRoot })).toContain(
      'Exploring is already active',
    )
  })

  it('blocks when todos.json already has tasks', () => {
    writePlanModeTodoList(
      'conv-1',
      replaceTodos([{ content: 'Ship', status: 'completed' }]),
      { sandboxRoot },
    )
    expect(enterPlanModeBlockedReason('conv-1', { sandboxRoot })).toContain(
      'todos.json',
    )
  })

  it('allows first-time enter when idle and no todos', () => {
    expect(enterPlanModeBlockedReason('conv-1', { sandboxRoot })).toBeNull()
  })
})
