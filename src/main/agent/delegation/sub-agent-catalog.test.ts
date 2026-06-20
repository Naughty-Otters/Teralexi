import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { EngineAgent } from '../config/catalog'
import type { AgentStepContext } from '../context'
import {
  buildSubAgentCatalog,
  formatSubAgentInstructionsBlock,
  formatSubAgentToolSuffix,
  hasSubAgentDelegationTool,
} from './sub-agent-catalog'
import {
  INVOKE_AGENT_TOOL_NAME,
} from '@toolSet/sub-agents/constants'

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
    availableSkillTools: [],
    availableSetTouched: false,
    toolNeedsApprovalOverrides: {},
    allowAsSubAgent: true,
    ...overrides,
  } as EngineAgent
}

function makeCtx(overrides: Partial<AgentStepContext> = {}): AgentStepContext {
  return {
    opts: {
      userId: 'user-1',
      agentId: 'coding',
      conversationId: 'conv-1',
      ...((overrides.opts as object) ?? {}),
    },
    executionSteps: overrides.executionSteps,
    agentRun: overrides.agentRun ?? { meta: { depth: 0 } },
    ...overrides,
  } as AgentStepContext
}

describe('sub-agent-catalog', () => {
  beforeEach(() => {
    vi.mocked(appCache.getAgents).mockReset()
    vi.mocked(isPlanModeActive).mockReturnValue(false)
  })

  it('hasSubAgentDelegationTool detects sub-agent tools', () => {
    expect(hasSubAgentDelegationTool(['read_file'])).toBe(false)
  })

  it('applies subAgentIds allow-list for invoke_agent targets', () => {
    vi.mocked(appCache.getAgents).mockReturnValue([
      mockAgent({ id: 'coding', name: 'Coding' }),
      mockAgent({ id: 'skill:github', name: 'GitHub', description: 'PR workflows' }),
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
      [INVOKE_AGENT_TOOL_NAME],
    )
    expect(catalog?.invokeAgentTargets.map((t) => t.id)).toEqual(['skill:github'])
  })

  it('formats invoke_agent instructions without removed delegate tools', () => {
    vi.mocked(appCache.getAgents).mockReturnValue([
      mockAgent({ id: 'skill:github', name: 'GitHub', description: 'PR workflows' }),
    ])
    const catalog = buildSubAgentCatalog(
      makeCtx({
        executionSteps: {
          toolLoop: { allowSubAgents: true },
        },
      }),
      [INVOKE_AGENT_TOOL_NAME],
    )
    expect(catalog).not.toBeNull()
    const block = formatSubAgentInstructionsBlock(catalog!, [INVOKE_AGENT_TOOL_NAME])
    expect(block).toContain('invoke_agent')
    expect(block).not.toContain('delegate_subagent')
    expect(block).not.toContain('invoke_skill')
  })
})
