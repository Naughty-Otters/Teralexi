import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AgentStepContext } from '../context'
import { filterToolsByAvailableSet } from '../steps/step-helpers'
import {
  INVOKE_AGENT_TOOL_NAME,
} from '@toolSet/sub-agents'
import { buildAgentToolSetForTests } from './tool-loop-expr'

vi.mock('../coding/plan-mode-state', () => ({
  isPlanModeActive: vi.fn(() => false),
}))

vi.mock('@main/cache/app-cache', () => ({
  appCache: { getAgents: vi.fn() },
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    getUserProperty: vi.fn(),
    getConversationSettings: vi.fn(() => null),
  })),
}))

import { appCache } from '@main/cache/app-cache'

function makeRunCtx(
  overrides: Partial<AgentStepContext> & {
    executionSteps?: AgentStepContext['executionSteps']
  } = {},
): AgentStepContext {
  return {
    opts: {
      userId: 'user-1',
      skillId: 'demo',
      agentId: 'skill:demo',
      ...overrides.opts,
    },
    executionSteps: overrides.executionSteps,
    config: {
      buildToolPromptDescription: (tool: { description?: string }) =>
        tool.description ?? '',
    },
    agentRun: { executeChildAndMerge: vi.fn() },
    agentFlow: { toolReadCache: new Map() },
    getLatestUserMessageContent: () => 'user task',
    currentMessages: [],
    sandbox: {
      getRoot: () => '/sandbox',
      getConversationId: () => 'conv-1',
      syncSandboxForToolExecution: vi.fn(),
    },
    ...overrides,
  } as unknown as AgentStepContext
}

describe('buildAgentToolSet sub-agent tools', () => {
  beforeEach(() => {
    vi.mocked(appCache.getAgents).mockReturnValue([
      {
        id: 'skill:documents',
        name: 'Documents',
        description: 'PDF extraction',
        allowAsSubAgent: true,
      } as never,
    ])
  })

  const runtimeTools = [
    {
      name: 'read_file',
      description: 'Read a file',
      source: 'skill' as const,
    },
    {
      name: INVOKE_AGENT_TOOL_NAME,
      description: 'Invoke configured sub-agent',
      source: 'skill' as const,
    },
    {
      name: 'invoke_agents',
      description: 'Invoke multiple sub-agents',
      source: 'skill' as const,
    },
  ]
  const tools = filterToolsByAvailableSet(runtimeTools)

   it('registers sub-agent tools only when allowSubAgents is enabled', () => {
    const without = buildAgentToolSetForTests(
      tools,
      makeRunCtx({
        executionSteps: {
          toolLoop: { tools: runtimeTools, maxIterations: 40 },
        },
      }),
      'demo',
    )
    expect(without[INVOKE_AGENT_TOOL_NAME]).toBeUndefined()
    expect(without.invoke_agents).toBeUndefined()

    const withDelegation = buildAgentToolSetForTests(
      tools,
      makeRunCtx({
        executionSteps: {
          toolLoop: {
            tools: runtimeTools,
            maxIterations: 40,
            allowSubAgents: true,
            subAgentIds: ['skill:documents'],
          },
        },
      }),
      'demo',
    )
    expect(withDelegation[INVOKE_AGENT_TOOL_NAME]).toBeDefined()
    expect(withDelegation.invoke_agents).toBeDefined()
  })

  it('omits all sub-agent delegation tools on nested runs', () => {
    const toolSet = buildAgentToolSetForTests(
      tools,
      makeRunCtx({
        agentRun: { meta: { depth: 1 }, executeChildAndMerge: vi.fn() },
        executionSteps: {
          toolLoop: {
            tools: runtimeTools,
            maxIterations: 40,
            allowSubAgents: true,
          },
        },
      }),
      'demo',
    )
    expect(toolSet[INVOKE_AGENT_TOOL_NAME]).toBeUndefined()
  })
})
