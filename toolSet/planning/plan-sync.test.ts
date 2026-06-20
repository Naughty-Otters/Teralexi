import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentPlanModeState } from '@shared/agent/plan-mode'
import { bootstrapPlanModeStorage } from '@main/agent/coding/plan-mode-state'
import { getAgentRunSandboxRoot } from '@main/agent/sandbox/run-context'
import {
  renderPlanMarkdownFromSteps,
  syncPlanFileFromTodoContents,
} from './plan-sync'

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

describe('plan-sync', () => {
  let sandboxRoot: string
  let planPath: string

  beforeEach(() => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'plan-sync-'))
    planPath = join(sandboxRoot, 'plans', 'implementation-plan.md')
    Object.assign(planState, {
      status: 'planning',
      planSlug: 'implementation-plan',
    })
    vi.mocked(getAgentRunSandboxRoot).mockReturnValue(sandboxRoot)
    bootstrapPlanModeStorage('conv-1', 'implementation-plan', { sandboxRoot })
  })

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true })
  })

  it('renderPlanMarkdownFromSteps builds numbered steps', () => {
    const md = renderPlanMarkdownFromSteps(['Alpha', 'Beta'])
    expect(md).toContain('## Steps')
    expect(md).toContain('1. Alpha')
    expect(md).toContain('2. Beta')
  })

  it('syncPlanFileFromTodoContents writes plan markdown from todos', () => {
    const result = syncPlanFileFromTodoContents('conv-1', [
      { content: 'Set up auth' },
      { content: 'Add tests' },
    ])
    expect(result.ok).toBe(true)
    expect(existsSync(planPath)).toBe(true)
    const written = readFileSync(planPath, 'utf8')
    expect(written).toContain('1. Set up auth')
    expect(written).toContain('2. Add tests')
  })
})
