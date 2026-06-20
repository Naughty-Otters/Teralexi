import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentFlow } from '../flow/agent-flow'
import { AgentRun } from './agent-run'
import { clearSubAgentRunRegistryForTests } from './sub-agent-run-registry'
import * as resolveChildAgent from './resolve-child-agent'

const baseOpts = {
  provider: 'ollama' as const,
  model: 'test',
  systemPrompt: '',
  messages: [],
  onChunk: vi.fn(),
  userId: 'u1',
  conversationId: 'c1',
  assistantMessageId: 'a1',
}

describe('sub-agent-run-registry integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSubAgentRunRegistryForTests()
    vi.spyOn(resolveChildAgent, 'resolveEngineAgent').mockResolvedValue({
      id: 'skill:child',
      name: 'Child Agent',
      allowAsSubAgent: true,
    } as never)
    vi.spyOn(resolveChildAgent, 'buildChildAgentResponseOpts').mockResolvedValue({
      opts: { ...baseOpts, agentId: 'skill:child' },
      model: {},
      agent: { id: 'skill:child', name: 'Child Agent' } as never,
    })
  })

  it('spawnChildRun returns runId and completes via waitForChildRuns', async () => {
    const flow = new AgentFlow(baseOpts, {})
    const parentRun = AgentRun.forFlow(flow, { runId: 'parent-run' })

    vi.spyOn(AgentRun, 'createChild').mockResolvedValue({
      meta: { runId: 'child-run', depth: 1, agentId: 'skill:child' },
      context: {
        hitlAwaitingApproval: false,
        hitlAwaitingFormData: false,
      },
      execute: vi.fn(async () => ({
        structuredContent: '{}',
        stepOutputs: { report: 'Child report' },
        hitlPaused: false,
        shouldPersistMemory: false,
      })),
    } as never)

    const spawned = await parentRun.spawnChildRun(
      {
        agentId: 'skill:child',
        parentOpts: baseOpts,
        task: 'Do work',
      },
      { waitMode: 'background' },
    )

    expect(spawned.runId).toBe('child-run')
    const results = await parentRun.waitForChildRuns([spawned.runId])
    expect(results[0]?.stepOutputs.report).toBe('Child report')
  })
})
