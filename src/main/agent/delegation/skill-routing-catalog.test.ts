import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { EngineAgent } from '../config/catalog'
import type { AgentStepContext } from '../context'
import {
  buildSkillRoutingCatalog,
  buildSubAgentCatalog,
  formatSkillRoutingBlock,
  formatSubAgentInstructionsBlock,
  formatSubAgentToolSuffix,
  hasSubAgentDelegationTool,
} from './skill-routing-catalog'
import { INVOKE_AGENTS_TOOL_NAME } from '@toolSet/sub-agents/constants'

vi.mock('@main/cache/app-cache', () => ({
  appCache: { getAgents: vi.fn() },
}))

vi.mock('../coding/plan-mode-state', () => ({
  isPlanModeActive: vi.fn(() => false),
}))

import { appCache } from '@main/cache/app-cache'
import { isPlanModeActive } from '../coding/plan-mode-state'

function mockAgent(overrides: Partial<EngineAgent> = {}): EngineAgent {
  return {
    id: 'skill:documents',
    name: 'Documents',
    description: 'PDF extraction and analysis',
    model: 'gpt-4',
    systemPrompt: '',
    provider: 'openai',
    isSkill: true,
    skillId: 'documents',
    availableSkillTools: [],
    availableSetTouched: false,
    toolNeedsApprovalOverrides: {},
    allowAsSubAgent: true,
    enabled: true,
    ...overrides,
  } as EngineAgent
}

function makeCtx(overrides: Partial<AgentStepContext> = {}): AgentStepContext {
  return {
    opts: {
      userId: 'user-1',
      agentId: 'skill:coding',
      conversationId: 'conv-1',
      ...((overrides.opts as object) ?? {}),
    },
    executionSteps: overrides.executionSteps,
    agentRun: overrides.agentRun ?? { meta: { depth: 0 } },
    ...overrides,
  } as AgentStepContext
}

describe('skill-routing-catalog', () => {
  beforeEach(() => {
    vi.mocked(appCache.getAgents).mockReset()
    vi.mocked(isPlanModeActive).mockReturnValue(false)
  })

  it('hasSubAgentDelegationTool detects sub-agent tools', () => {
    expect(hasSubAgentDelegationTool(['read_file'])).toBe(false)
    expect(hasSubAgentDelegationTool([INVOKE_AGENTS_TOOL_NAME])).toBe(true)
  })

  it('includes skill-group sibling triggers without invoke_agents', () => {
    vi.mocked(appCache.getAgents).mockReturnValue([
      mockAgent({
        id: 'skill:coding',
        name: 'Coding',
        skillId: 'coding',
        skillGroup: 'coding',
        skillGroupLabel: 'Coding',
        skillVariant: 'implement',
        skillsPrompt: '### Trigger\n\nImplement features.',
      }),
      mockAgent({
        id: 'skill:coding-review',
        name: 'Coding Review',
        skillId: 'coding-review',
        skillGroup: 'coding',
        skillGroupLabel: 'Coding',
        skillVariant: 'review',
        skillVariantOrder: 2,
        skillsPrompt: '### Trigger\n\nReview a PR or diff.',
        description: 'Read-only review',
      }),
    ])

    const catalog = buildSkillRoutingCatalog(makeCtx(), ['read_file'])
    expect(catalog?.entries.map((e) => e.agentId)).toEqual(['skill:coding-review'])
    const block = formatSkillRoutingBlock(catalog!, ['read_file'])
    expect(block).toContain('Review a PR or diff')
    expect(block).toContain('/skill:coding-review')
    expect(block).not.toContain('invoke_agents')
  })

  it('applies subAgentIds allow-list for invoke_agents targets', () => {
    vi.mocked(appCache.getAgents).mockReturnValue([
      mockAgent({ id: 'skill:coding', name: 'Coding', skillId: 'coding' }),
      mockAgent({
        id: 'skill:github',
        name: 'GitHub',
        skillId: 'github',
        description: 'PR workflows',
        skillsPrompt: '### Trigger\n\nOpen pull requests.',
      }),
      mockAgent(),
    ])
    const catalog = buildSubAgentCatalog(
      makeCtx({
        executionSteps: {
          toolLoop: {
            allowSubAgents: true,
            subAgentIds: ['skill:github'],
          },
        },
      }),
      [INVOKE_AGENTS_TOOL_NAME],
    )
    expect(catalog?.invokeAgentTargets.map((t) => t.id)).toEqual(['skill:github'])
    const block = formatSubAgentInstructionsBlock(catalog!, [INVOKE_AGENTS_TOOL_NAME])
    expect(block).toContain('Open pull requests')
    expect(block).toContain('invoke_agents')
  })

  it('formatSubAgentToolSuffix lists invoke targets with trigger summary', () => {
    vi.mocked(appCache.getAgents).mockReturnValue([
      mockAgent({ id: 'skill:coding', name: 'Coding', skillId: 'coding' }),
      mockAgent({
        id: 'skill:github',
        name: 'GitHub',
        skillId: 'github',
        skillsPrompt: '### Trigger\n\nOpen pull requests.',
      }),
    ])
    const catalog = buildSkillRoutingCatalog(
      makeCtx({
        executionSteps: {
          toolLoop: { allowSubAgents: true },
        },
      }),
      [INVOKE_AGENTS_TOOL_NAME],
    )
    const suffix = formatSubAgentToolSuffix(INVOKE_AGENTS_TOOL_NAME, catalog!)
    expect(suffix).toContain('skill:github')
    expect(suffix).toContain('Open pull requests')
  })
})
