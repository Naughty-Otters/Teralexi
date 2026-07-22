import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  bindSubAgentDelegation,
  resetSubAgentDelegationStack,
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

  it('invoke_agents requires an active AgentRun', async () => {
    bindSubAgentDelegation({
      parentRun: undefined,
      allowSubAgents: true,
      opts: { userId: 'user-1' },
      getLatestUserMessageContent: () => '',
      resolveSubAgentTargetId: async (id) => id,
    })
    await expect(
      invokeAgents.execute({
        runs: [{ agentId: 'skill:documents', task: 'Do work' }],
      }),
    ).rejects.toThrow(/requires an active AgentRun/)
  })

  it('invoke_agents enforces allow-list and returns waited results', async () => {
    const spawnChildRun = vi.fn(async (params: { agentId: string; task: string }) => ({
      runId: `run-${params.agentId}`,
      agentId: params.agentId,
      agentName: params.agentId,
    }))
    const waitForChildRuns = vi.fn(async () => [
      {
        runId: 'run-skill:allowed',
        agentId: 'skill:allowed',
        agentName: 'skill:allowed',
        status: 'completed',
        report: 'done',
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
      subAgentIds: ['skill:allowed'],
      opts: { userId: 'user-1', conversationId: 'conv-1' },
      getLatestUserMessageContent: () => '',
      resolveSubAgentTargetId: async (id) => id,
    })

    const blocked = await invokeAgents.execute({
      runs: [{ agentId: 'skill:blocked', task: 'nope' }],
    })
    expect(blocked).toMatchObject({
      error: expect.stringContaining('not enabled'),
    })

    const out = await invokeAgents.execute({
      runs: [{ agentId: 'skill:allowed', task: 'go' }],
    })
    expect(spawnChildRun).toHaveBeenCalledWith(
      {
        agentId: 'skill:allowed',
        parentOpts: { userId: 'user-1', conversationId: 'conv-1' },
        task: 'go',
      },
      { waitMode: 'background' },
    )
    expect(out).toMatchObject({
      results: [
        expect.objectContaining({
          runId: 'run-skill:allowed',
          summary: 'done',
          worktreeOutcome: 'discarded',
        }),
      ],
    })
  })

  it('invoke_agents applies explore profile tools and instructions', async () => {
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
        report: 'found auth',
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
      subAgentIds: ['skill:coding'],
      opts: { userId: 'user-1' },
      getLatestUserMessageContent: () => '',
      resolveSubAgentTargetId: async (id) => id,
    })

    const out = await invokeAgents.execute({
      runs: [{ profile: 'explore', task: 'Where is auth?' }],
    })
    expect(spawnChildRun).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'skill:coding',
        task: '[Explore] Where is auth?',
        isolateGitWorktree: false,
        slimContext: true,
        systemPromptAddendum: expect.stringContaining('Explore sub-agent'),
      }),
      { waitMode: 'background' },
    )
    const allowed = spawnChildRun.mock.calls[0]?.[0]?.allowedToolNames
    expect(allowed).toContain('lsp')
    expect(allowed).toContain('shell')
    expect(allowed).not.toContain('edit_files')
    expect(out).toMatchObject({
      results: [expect.objectContaining({ summary: 'found auth' })],
    })
  })

  it('invoke_agents applies bash profile with command tools', async () => {
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
        report: 'tests failed',
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
      subAgentIds: ['skill:coding'],
      opts: { userId: 'user-1' },
      getLatestUserMessageContent: () => '',
      resolveSubAgentTargetId: async (id) => id,
    })

    await invokeAgents.execute({
      runs: [{ profile: 'bash', task: 'Run npm test' }],
    })
    expect(spawnChildRun).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'skill:coding',
        task: '[Bash] Run npm test',
        mcpAccess: 'none',
        slimContext: true,
        systemPromptAddendum: expect.stringContaining('Bash sub-agent'),
      }),
      { waitMode: 'background' },
    )
    const allowed = spawnChildRun.mock.calls[0]?.[0]?.allowedToolNames
    expect(allowed).toContain('shell')
    expect(allowed).not.toContain('edit_files')
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
    expect(waitForChildRuns).toHaveBeenCalledWith([
      'run-skill:a',
      'run-skill:b',
    ])
    expect(out).toMatchObject({
      results: [
        expect.objectContaining({ agentId: 'skill:a', summary: 'a' }),
        expect.objectContaining({ agentId: 'skill:b', summary: 'b' }),
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
      error: expect.stringContaining('agentId or profile'),
    })
  })
})
