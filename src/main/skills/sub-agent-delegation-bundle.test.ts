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

  it('bundled invoke_agent sees bind from the main process module', async () => {
    const tools = await loadToolSetTools()
    const invoke = tools.find((t) => t.name === 'invoke_agent')
    expect(invoke).toBeDefined()

    const executeChildAndMerge = vi.fn().mockResolvedValue({
      hitlPaused: false,
      stepOutputs: { report: 'child output' },
    })

    bindSubAgentDelegation({
      parentRun: { meta: { depth: 0 }, executeChildAndMerge },
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
      agentId: 'coding',
      task: 'List top-level folders',
    })

    expect(executeChildAndMerge).toHaveBeenCalledWith({
      agentId: 'skill:coding',
      parentOpts: expect.objectContaining({
        userId: 'default',
        conversationId: 'conv-1',
      }),
      task: 'List top-level folders',
    })
    expect(result).toMatchObject({
      status: 'completed',
      summary: 'child output',
      filesTouched: [],
      openQuestions: [],
      agentId: 'skill:coding',
    })
    clearSubAgentDelegation()
  })
})
