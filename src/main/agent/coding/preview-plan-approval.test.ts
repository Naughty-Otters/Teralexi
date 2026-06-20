import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentPlanModeState } from '@shared/agent/plan-mode'
import { getAgentRunSandboxRoot } from '@main/agent/sandbox/run-context'
import { previewPlanApproval } from './preview-plan-approval'
import { bootstrapPlanModeStorage } from './plan-mode-state'
import { writePlanModeTodoList } from './plan-mode-storage-impl'
import { replaceTodos } from '@shared/agent/todos'

const { planState } = vi.hoisted(() => {
  const planState: AgentPlanModeState = {
    status: 'planning',
    planSlug: 'implementation-plan',
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

describe('previewPlanApproval', () => {
  let sandboxRoot: string

  beforeEach(() => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'plan-preview-'))
    vi.mocked(getAgentRunSandboxRoot).mockReturnValue(sandboxRoot)
    bootstrapPlanModeStorage('conv-1', 'implementation-plan', { sandboxRoot })
    writePlanModeTodoList(
      'conv-1',
      replaceTodos([
        { content: 'Set up auth', status: 'pending' },
        { content: 'Add tests', status: 'pending' },
      ]),
      { sandboxRoot },
    )
  })

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true })
  })

  it('returns plan markdown and todos for approval UI', () => {
    const result = previewPlanApproval({
      conversationId: 'conv-1',
      agentSummary: 'Ready to ship',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.planMarkdown).toContain('## Steps')
    expect(result.planFilePath).toBe('plans/implementation-plan.md')
    expect(result.todos).toHaveLength(2)
    expect(result.agentSummary).toBe('Ready to ship')
  })
})
