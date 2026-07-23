import { describe, expect, it, vi, beforeEach } from 'vitest'
import { subAgentsInjector } from './sub-agents'
import type { InjectionRunContext } from '../types'
import type { AgentStepContext } from '../../context'

vi.mock('../../delegation/skill-routing-catalog', () => ({
  buildSkillRoutingCatalog: vi.fn(),
  formatSkillRoutingBlock: vi.fn(),
  hasSkillRoutingTargets: vi.fn(),
  hasSubAgentDelegationTool: vi.fn(),
}))

vi.mock('../../coding/plan-mode-state', () => ({
  isPlanModeActive: vi.fn(() => false),
}))

import {
  buildSkillRoutingCatalog,
  formatSkillRoutingBlock,
  hasSkillRoutingTargets,
  hasSubAgentDelegationTool,
} from '../../delegation/skill-routing-catalog'

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
    tools: [{ name: 'invoke_agents', source: 'skill' as const, description: '' }],
    ...overrides,
  }
}

describe('subAgentsInjector', () => {
  beforeEach(() => {
    vi.mocked(hasSubAgentDelegationTool).mockReturnValue(true)
    vi.mocked(buildSkillRoutingCatalog).mockReturnValue({
      entries: [
        {
          agentId: 'skill:documents',
          skillId: 'documents',
          displayName: 'Documents',
          description: 'PDF work',
          trigger: 'Review PDFs',
          canSwitch: true,
          canInvoke: true,
        },
      ],
      groupLabel: null,
    })
    vi.mocked(formatSkillRoutingBlock).mockReturnValue(
      '### Related skills & sub-agents\n- `skill:documents`',
    )
  })

  it('applies on root tool-loop runs with routing targets', () => {
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
    vi.mocked(hasSkillRoutingTargets).mockReturnValue(false)
    expect(subAgentsInjector.applies(makeRunCtx({ tools: [] }))).toBe(false)
  })

  it('injectInstructions returns priority built-ins plus routing block', () => {
    const block = subAgentsInjector.injectInstructions!(makeRunCtx())
    expect(block).toContain('Priority built-in sub-agents')
    expect(block).toContain('`browser`')
    expect(block).toContain('skill:documents')
    expect(buildSkillRoutingCatalog).toHaveBeenCalled()
    expect(formatSkillRoutingBlock).toHaveBeenCalled()
  })
})
