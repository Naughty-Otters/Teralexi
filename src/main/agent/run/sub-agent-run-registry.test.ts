import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentFlow } from '../flow/agent-flow'
import { AgentRun } from './agent-run'
import { clearSubAgentRunRegistryForTests } from './sub-agent-run-registry'
import * as resolveChildAgent from './resolve-child-agent'
import * as conversationWorkspace from '../workspace/conversation-workspace'

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
    vi.spyOn(conversationWorkspace, 'getWorkspacePath').mockReturnValue(null)
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
    expect(results[0]?.status).toBe('completed')
    expect(results[0]?.report).toBe('Child report')
    expect(results[0]?.result?.stepOutputs.report).toBe('Child report')
  })

  it('failed child settles without rejecting waitForChildRuns', async () => {
    const flow = new AgentFlow(baseOpts, {})
    const parentRun = AgentRun.forFlow(flow, { runId: 'parent-run' })

    vi.spyOn(AgentRun, 'createChild').mockResolvedValue({
      meta: { runId: 'child-fail', depth: 1, agentId: 'skill:child' },
      context: {
        hitlAwaitingApproval: false,
        hitlAwaitingFormData: false,
      },
      execute: vi.fn(async () => {
        throw new Error('boom')
      }),
    } as never)

    const spawned = await parentRun.spawnChildRun(
      {
        agentId: 'skill:child',
        parentOpts: baseOpts,
        task: 'Do work',
      },
      { waitMode: 'background' },
    )
    const results = await parentRun.waitForChildRuns([spawned.runId])
    expect(results[0]?.status).toBe('failed')
    expect(results[0]?.error).toContain('boom')
  })

  it('cancelSubAgentRun aborts an in-flight child', async () => {
    const flow = new AgentFlow(baseOpts, {})
    const parentRun = AgentRun.forFlow(flow, { runId: 'parent-run' })
    let resolveExecute: (() => void) | undefined
    const executeGate = new Promise<void>((resolve) => {
      resolveExecute = resolve
    })

    vi.spyOn(AgentRun, 'createChild').mockResolvedValue({
      meta: { runId: 'child-cancel', depth: 1, agentId: 'skill:child' },
      context: {
        hitlAwaitingApproval: false,
        hitlAwaitingFormData: false,
      },
      execute: vi.fn(async () => {
        await executeGate
        return {
          structuredContent: '{}',
          stepOutputs: { report: 'late' },
          hitlPaused: false,
          shouldPersistMemory: false,
        }
      }),
    } as never)

    const { cancelSubAgentRun } = await import('./sub-agent-run-registry')
    const spawned = await parentRun.spawnChildRun(
      {
        agentId: 'skill:child',
        parentOpts: baseOpts,
        task: 'Do work',
      },
      { waitMode: 'background' },
    )
    expect(cancelSubAgentRun(spawned.runId)).toBe(true)
    resolveExecute?.()
    const results = await parentRun.waitForChildRuns([spawned.runId])
    expect(['cancelled', 'completed']).toContain(results[0]?.status)
  })

  it('forwards workspacePathOverride to createChild', async () => {
    const flow = new AgentFlow(baseOpts, {})
    const parentRun = AgentRun.forFlow(flow, { runId: 'parent-run' })
    const createChild = vi.spyOn(AgentRun, 'createChild').mockResolvedValue({
      meta: { runId: 'child-wt', depth: 1, agentId: 'skill:child' },
      context: {
        hitlAwaitingApproval: false,
        hitlAwaitingFormData: false,
      },
      execute: vi.fn(async () => ({
        structuredContent: '{}',
        stepOutputs: { report: 'ok' },
        hitlPaused: false,
        shouldPersistMemory: false,
      })),
    } as never)

    await parentRun.spawnChildRun(
      {
        agentId: 'skill:child',
        parentOpts: baseOpts,
        task: 'Do work',
        workspacePathOverride: '/tmp/isolated-wt',
        isolateGitWorktree: false,
      },
      { waitMode: 'background' },
    )

    expect(createChild).toHaveBeenCalled()
    const params = createChild.mock.calls[0]?.[1] as {
      workspacePathOverride?: string
    }
    expect(params.workspacePathOverride).toBe('/tmp/isolated-wt')
  })
})
