import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  bindSubAgentDelegation,
  resetSubAgentDelegationStack,
  invokeAgent,
  invokeAgents,
} from './index'

vi.mock('@main/agent/run/resolve-child-agent', () => ({
  mergeSubFlowOutputText: vi.fn(
    (outputs: { report?: string }) => outputs.report ?? 'merged report',
  ),
}))

describe('sub-agent tools', () => {
  beforeEach(() => {
    resetSubAgentDelegationStack()
  })

  afterEach(() => {
    resetSubAgentDelegationStack()
  })

  it('invoke_agent requires an active AgentRun', async () => {
    bindSubAgentDelegation({
      parentRun: undefined,
      allowSubAgents: true,
      opts: { userId: 'user-1' },
      getLatestUserMessageContent: () => '',
      resolveSubAgentTargetId: async (id) => id,
    })
    await expect(
      invokeAgent.execute({ agentId: 'skill:documents', task: 'Do work' }),
    ).rejects.toThrow(/requires an active AgentRun/)
  })

  it('invoke_agent enforces subAgentIds allow-list and forwards child params', async () => {
    const executeChildAndMerge = vi.fn().mockResolvedValue({
      hitlPaused: false,
      stepOutputs: { report: 'done' },
    })
    bindSubAgentDelegation({
      parentRun: { meta: { depth: 0 }, executeChildAndMerge },
      allowSubAgents: true,
      subAgentIds: ['skill:allowed'],
      opts: { userId: 'user-1', conversationId: 'conv-1' },
      getLatestUserMessageContent: () => '',
      resolveSubAgentTargetId: async (id) => id,
    })

    await expect(
      invokeAgent.execute({ agentId: 'skill:blocked', task: 'nope' }),
    ).rejects.toThrow(/not enabled for invoke_agent/)

    await invokeAgent.execute({ agentId: 'skill:allowed', task: 'go' })
    expect(executeChildAndMerge).toHaveBeenCalledWith({
      agentId: 'skill:allowed',
      parentOpts: { userId: 'user-1', conversationId: 'conv-1' },
      task: 'go',
    })
    expect(executeChildAndMerge.mock.calls[0]?.[0]).not.toHaveProperty(
      'contextMessages',
    )
  })

  it('invoke_agent resolves short agent ids before allow-list and child spawn', async () => {
    const executeChildAndMerge = vi.fn().mockResolvedValue({
      hitlPaused: false,
      stepOutputs: { report: 'done' },
    })
    bindSubAgentDelegation({
      parentRun: { meta: { depth: 0 }, executeChildAndMerge },
      allowSubAgents: true,
      subAgentIds: ['skill:coding'],
      opts: { userId: 'user-1' },
      getLatestUserMessageContent: () => '',
      resolveSubAgentTargetId: async (id) =>
        id.startsWith('skill:') ? id : `skill:${id}`,
    })

    await invokeAgent.execute({ agentId: 'coding', task: 'Implement X' })
    expect(executeChildAndMerge).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'skill:coding', task: 'Implement X' }),
    )
  })

  it('invoke_agents forwards child params for each run', async () => {
    const spawnChildRun = vi.fn(async (params: { agentId: string; task: string }) => ({
      runId: `run-${params.agentId}`,
      agentId: params.agentId,
      agentName: params.agentId,
    }))
    const waitForChildRuns = vi.fn(async () => [
      {
        runId: 'run-skill:a',
        agentId: 'skill:a',
        agentName: 'skill:a',
        status: 'completed',
        report: 'a',
        hitlPaused: false,
      },
      {
        runId: 'run-skill:b',
        agentId: 'skill:b',
        agentName: 'skill:b',
        status: 'completed',
        report: 'b',
        hitlPaused: false,
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
      opts: { userId: 'user-1', conversationId: 'conv-1' },
      getLatestUserMessageContent: () => '',
      resolveSubAgentTargetId: async (id) => id,
    })

    const out = await invokeAgents.execute({
      runs: [
        { agentId: 'skill:a', task: 'Task A' },
        { agentId: 'skill:b', task: 'Task B' },
      ],
    })

    expect(spawnChildRun).toHaveBeenCalledTimes(2)
    expect(spawnChildRun).toHaveBeenNthCalledWith(
      1,
      {
        agentId: 'skill:a',
        parentOpts: { userId: 'user-1', conversationId: 'conv-1' },
        task: 'Task A',
      },
      { waitMode: 'background' },
    )
    expect(waitForChildRuns).toHaveBeenCalledWith(['run-skill:a', 'run-skill:b'])
    expect(out).toMatchObject({
      results: [
        { runId: 'run-skill:a', status: 'completed', report: 'a' },
        { runId: 'run-skill:b', status: 'completed', report: 'b' },
      ],
    })
  })

  it('invoke_agents preflights parallel slots and empty agentIds', async () => {
    bindSubAgentDelegation({
      parentRun: {
        meta: { depth: 0, runId: 'parent' },
        executeChildAndMerge: vi.fn(),
        spawnChildRun: vi.fn(),
        waitForChildRuns: vi.fn(),
        remainingParallelSlots: () => 1,
      },
      allowSubAgents: true,
      opts: { userId: 'user-1' },
      getLatestUserMessageContent: () => '',
      resolveSubAgentTargetId: async (id) => id,
    })

    const tooMany = await invokeAgents.execute({
      runs: [
        { agentId: 'skill:a', task: 'A' },
        { agentId: 'skill:b', task: 'B' },
      ],
    })
    expect(tooMany).toMatchObject({ error: expect.stringContaining('slot') })

    const emptyId = await invokeAgents.execute({
      runs: [{ agentId: '   ', task: 'A' }],
    })
    expect(emptyId).toMatchObject({
      error: expect.stringContaining('non-empty agentId'),
    })
  })

  it('invoke_agents wait=false returns runIds without waiting', async () => {
    const spawnChildRun = vi.fn(async () => ({
      runId: 'bg-1',
      agentId: 'skill:a',
      agentName: 'A',
    }))
    const waitForChildRuns = vi.fn()
    bindSubAgentDelegation({
      parentRun: {
        meta: { depth: 0, runId: 'parent' },
        executeChildAndMerge: vi.fn(),
        spawnChildRun,
        waitForChildRuns,
        remainingParallelSlots: () => 10,
      },
      allowSubAgents: true,
      opts: { userId: 'user-1' },
      getLatestUserMessageContent: () => '',
      resolveSubAgentTargetId: async (id) => id,
    })

    const out = await invokeAgents.execute({
      wait: false,
      runs: [{ agentId: 'skill:a', task: 'Task A' }],
    })
    expect(out).toEqual({
      runIds: ['bg-1'],
      runs: [{ runId: 'bg-1', agentId: 'skill:a', agentName: 'A' }],
    })
    expect(waitForChildRuns).not.toHaveBeenCalled()
  })
})
