import { describe, expect, it, vi, beforeEach } from 'vitest'
import { subAgentsInjector } from './sub-agents'
import type { InjectionRunContext } from '../types'
import type { AgentStepContext } from '../../context'

vi.mock('../../delegation/sub-agent-catalog', () => ({
  buildSubAgentCatalog: vi.fn(),
  formatSubAgentInstructionsBlock: vi.fn(),
  hasSubAgentDelegationTool: vi.fn(),
}))

vi.mock('../../coding/plan-mode-state', () => ({
  isPlanModeActive: vi.fn(() => false),
}))

import {
  buildSubAgentCatalog,
  formatSubAgentInstructionsBlock,
  hasSubAgentDelegationTool,
} from '../../delegation/sub-agent-catalog'

function makeRunCtx(overrides: Partial<InjectionRunContext> = {}): InjectionRunContext {
  return {
    profile: {
      key: 'toolLoop.coding.root',
      stage: 'toolLoop',
      runDepth: 0,
      isCodingAgent: true,
      planModeUsesPrepareStep: true,
    },
    ctx: {
      opts: { userId: 'user-1', conversationId: 'conv-1' },
    } as AgentStepContext,
    loopStep: 0,
    tools: [{ name: 'invoke_agent', source: 'skill' as const, description: '' }],
    ...overrides,
  }
}

describe('subAgentsInjector', () => {
  beforeEach(() => {
    vi.mocked(hasSubAgentDelegationTool).mockReturnValue(true)
    vi.mocked(buildSubAgentCatalog).mockReturnValue({
      invokeAgentTargets: [
        { id: 'skill:documents', name: 'Documents', description: 'PDF work' },
      ],
    })
    vi.mocked(formatSubAgentInstructionsBlock).mockReturnValue(
      '### Sub-agent delegation\n- `skill:documents`',
    )
  })

  it('applies only on root tool-loop runs with sub-agent tools', () => {
    expect(subAgentsInjector.applies(makeRunCtx())).toBe(true)
    expect(
      subAgentsInjector.applies(
        makeRunCtx({
          profile: {
            ...makeRunCtx().profile,
            runDepth: 1,
          },
        }),
      ),
    ).toBe(false)
    vi.mocked(hasSubAgentDelegationTool).mockReturnValue(false)
    expect(subAgentsInjector.applies(makeRunCtx())).toBe(false)
  })

  it('injectInstructions returns formatted catalog block', () => {
    const block = subAgentsInjector.injectInstructions!(makeRunCtx())
    expect(block).toContain('skill:documents')
    expect(buildSubAgentCatalog).toHaveBeenCalled()
    expect(formatSubAgentInstructionsBlock).toHaveBeenCalled()
  })
})
