import { describe, expect, it, vi, afterEach } from 'vitest'

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    getUserProperty: vi.fn(),
    getConversationSettings: vi.fn(() => null),
  })),
}))

vi.mock('@main/agent/run/resolve-child-agent', () => ({
  mergeSubFlowOutputText: vi.fn(() => 'child report'),
}))

import {
  bindSubAgentDelegation,
  clearSubAgentDelegation,
  resetSubAgentDelegationStack,
} from '@toolSet/sub-agents'
import { loadToolSetTools } from '@main/skills/skill-module-loader'

describe('sub-agent delegation across skill bundles', () => {
  afterEach(() => {
    resetSubAgentDelegationStack()
  })

  it('bundled invoke_agents sees bind from the main process module', async () => {
    const tools = await loadToolSetTools()
    const invoke = tools.find((t) => t.name === 'invoke_agents')
    expect(invoke).toBeDefined()

    const spawnChildRun = vi.fn(async (params: { agentId: string; task: string }) => ({
      runId: `run-${params.agentId}`,
      agentId: params.agentId,
      agentName: params.agentId,
    }))
    const waitForChildRuns = vi.fn(async () => [
      {
        runId: 'run-skill:coding',
        agentId: 'skill:coding',
        agentName: 'skill:coding',
        status: 'completed',
        report: 'child output',
        hitlPaused: false,
        worktreeOutcome: 'discarded' as const,
      },
    ])

    bindSubAgentDelegation({
      parentRun: {
        meta: { depth: 0, runId: 'parent' },
        executeChildAndMerge: vi.fn(),
        spawnChildRun,
        waitForChildRuns,
        remainingParallelSlots: () => 10,
      },
      allowSubAgents: true,
      opts: {
        userId: 'default',
        skillId: 'default',
        agentId: 'skill:default',
        conversationId: 'conv-1',
      },
      getLatestUserMessageContent: () => 'scan the repo',
      resolveSubAgentTargetId: async (id) =>
        id.startsWith('skill:') ? id : `skill:${id}`,
    })

    const result = await invoke!.execute({
      runs: [{ agentId: 'coding', task: 'List top-level folders' }],
    })

    expect(spawnChildRun).toHaveBeenCalledWith(
      {
        agentId: 'skill:coding',
        parentOpts: expect.objectContaining({
          userId: 'default',
          conversationId: 'conv-1',
        }),
        task: 'List top-level folders',
      },
      { waitMode: 'background' },
    )
    expect(result).toMatchObject({
      results: [
        expect.objectContaining({
          status: 'completed',
          summary: 'child output',
          agentId: 'skill:coding',
        }),
      ],
    })
    clearSubAgentDelegation()
  })
})
