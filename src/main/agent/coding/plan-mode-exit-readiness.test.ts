import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentPlanModeState } from '@shared/agent/plan-mode'

const { planState } = vi.hoisted(() => {
  const planState: AgentPlanModeState = {
    status: 'planning',
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

import { assessPlanModeExitReadiness } from './plan-mode-exit-readiness'
import {
  bootstrapPlanModeStorage,
  writePlanModeTodoList,
} from './plan-mode-storage-impl'
import { replaceTodos } from '@shared/agent/todos'

describe('assessPlanModeExitReadiness', () => {
  let sandboxRoot: string

  beforeEach(() => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'plan-ready-'))
    Object.assign(planState, {
      status: 'planning',
      planSlug: null,
    })
  })

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true })
  })

  it('is ready when todos exist on disk', () => {
    const conversationId = 'conv-readiness-todos'
    bootstrapPlanModeStorage(conversationId, 'feature', { sandboxRoot })
    writePlanModeTodoList(
      conversationId,
      replaceTodos([{ content: 'Implement feature', status: 'pending' }]),
      { sandboxRoot },
    )

    const result = assessPlanModeExitReadiness(conversationId, { sandboxRoot })
    expect(result.ready).toBe(true)
    expect(result.todoCount).toBe(1)
  })

  it('is ready when plan markdown has actionable steps', () => {
    const conversationId = 'conv-readiness-plan-md'
    const storage = bootstrapPlanModeStorage(conversationId, 'feature', {
      sandboxRoot,
    })
    mkdirSync(join(sandboxRoot, 'plans'), { recursive: true })
    writeFileSync(
      storage!.planFile.absolutePath,
      '## Steps\n1. Ship the auth module\n',
      'utf8',
    )

    const result = assessPlanModeExitReadiness(conversationId, { sandboxRoot })
    expect(result.ready).toBe(true)
    expect(result.hasActionablePlanSteps).toBe(true)
  })
})
