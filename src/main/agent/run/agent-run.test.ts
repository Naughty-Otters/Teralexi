import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../workspace/conversation-workspace', () => ({
  getWorkspacePath: vi.fn(() => null),
}))

import { AgentFlow } from '../flow/agent-flow'
import { AgentRun } from './agent-run'
import { runWithAgentRunScope } from './run-scope'
import { MAX_AGENT_RUN_DEPTH } from './types'
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

describe('AgentRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forFlow wires agentRun on flow context', () => {
    const flow = new AgentFlow(baseOpts, {})
    const run = AgentRun.forFlow(flow, { runId: 'run-test' })
    expect(flow.context.agentRun).toBe(run)
    expect(run.meta.runId).toBe('run-test')
    expect(run.meta.depth).toBe(0)
  })

  it('startRoot creates a depth-0 run', () => {
    const run = AgentRun.startRoot(baseOpts, {})
    expect(run.meta.depth).toBe(0)
    expect(run.flow.context.opts.conversationId).toBe('c1')
  })

  it('execute returns lifecycle output and sandbox snapshot metadata', async () => {
    const onSandboxReady = vi.fn()
    const onSandboxResultWritten = vi.fn()
    const flow = new AgentFlow(
      { ...baseOpts, onSandboxReady, onSandboxResultWritten },
      {},
    )
    const structured = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: { finalResult: 'done', report: '', stepCaptures: [] },
        subSteps: [],
      },
    })

    vi.spyOn(flow, 'executeRunLifecycle').mockResolvedValue(structured)

    const sandbox = flow.context.sandbox
    vi.spyOn(sandbox, 'acquireForConversation').mockResolvedValue({
      layout: { root: '/tmp/sandbox' },
      buildInstructionBlock: () => '',
      buildSandboxStructureBlock: () => '',
      buildWorkspaceStructureBlock: () => '',
      ensureToolLoopStepOutputDirs: vi.fn(),
    } as never)
    vi.spyOn(sandbox, 'defaultToolLoopPreviewDir').mockReturnValue('/tmp/sandbox/output')
    vi.spyOn(sandbox, 'buildReadyPayload').mockReturnValue({ sandboxRoot: '/tmp/sandbox' } as never)
    vi.spyOn(sandbox, 'writeFinalResult').mockResolvedValue({
      outputResultsDir: '/tmp/sandbox/output/results',
      resultFilePath: '/tmp/sandbox/output/results/result-snapshot.pdf',
      resultsFileUrl: 'file:///tmp/sandbox/output/results/result-snapshot.pdf',
      resultSnapshotPdfPath: '/tmp/sandbox/output/results/result-snapshot.pdf',
      resultSnapshotPdfUrl: 'file:///tmp/sandbox/output/results/result-snapshot.pdf',
    })

    const run = AgentRun.forFlow(flow)
    const result = await run.execute()

    expect(result.structuredContent).toContain('resultSnapshot')
    expect(result.hitlPaused).toBe(false)
    expect(onSandboxReady).toHaveBeenCalled()
    expect(onSandboxResultWritten).toHaveBeenCalled()
  })

  it('execute continues when writeFinalResult fails', async () => {
    const flow = new AgentFlow(baseOpts, {})
    vi.spyOn(flow, 'executeRunLifecycle').mockResolvedValue(
      JSON.stringify({
        version: 2,
        assistantContent: {
          outer: { finalResult: 'done', report: '', stepCaptures: [] },
          subSteps: [],
        },
      }),
    )

    const sandbox = flow.context.sandbox
    vi.spyOn(sandbox, 'acquireForConversation').mockResolvedValue({
      layout: { root: '/tmp/sandbox' },
      buildInstructionBlock: () => '',
      buildSandboxStructureBlock: () => '',
      buildWorkspaceStructureBlock: () => '',
      ensureToolLoopStepOutputDirs: vi.fn(),
    } as never)
    vi.spyOn(sandbox, 'defaultToolLoopPreviewDir').mockReturnValue('/tmp/sandbox/output')
    vi.spyOn(sandbox, 'buildReadyPayload').mockReturnValue({ sandboxRoot: '/tmp/sandbox' } as never)
    vi.spyOn(sandbox, 'writeFinalResult').mockRejectedValue(new Error('write failed'))

    const run = AgentRun.forFlow(flow)
    const result = await run.execute()

    expect(result.structuredContent).toContain('done')
    expect(result.hitlPaused).toBe(false)
  })

  it('executeChildAndMerge saves pending frame when child pauses', async () => {
    vi.spyOn(resolveChildAgent, 'resolveEngineAgent').mockResolvedValue({
      id: 'skill:child',
      name: 'Child',
    } as never)

    const flow = new AgentFlow(baseOpts, {})
    const parentRun = AgentRun.forFlow(flow)

    vi.spyOn(parentRun, 'forkChild').mockResolvedValue({
      meta: { runId: 'child-run', depth: 1, agentId: 'skill:child' },
      context: {
        hitlAwaitingApproval: true,
        hitlAwaitingFormData: false,
        currentMessages: [],
        stepOutputs: {},
        stepContexts: {},
        stepHistory: [],
        collectedFormByTodoId: {},
        resumeTodoIndex: 0,
        lastHitlPausedStageId: 'toolLoop',
      },
      execute: vi.fn(async () => ({
        structuredContent: '{}',
        stepOutputs: {},
        hitlPaused: true,
        pausedStageId: 'toolLoop',
        shouldPersistMemory: false,
      })),
    } as never)

    await runWithAgentRunScope(
      { runId: 'parent-run', depth: 0, sandboxRoot: '/tmp/sandbox' },
      async () => {
        const result = await parentRun.executeChildAndMerge({
          agentId: 'skill:child',
          parentOpts: flow.context.opts,
          task: 'child task',
          parentHitlPauseStageId: 'subFlow',
        })
        expect(result.hitlPaused).toBe(true)
        expect(flow.context.hitlAwaitingApproval).toBe(true)
      },
    )
  })

  it('createChild throws when nesting depth is exceeded', async () => {
    const flow = new AgentFlow(baseOpts, {})
    const parent = new AgentRun(flow, {
      runId: 'deep-parent',
      depth: MAX_AGENT_RUN_DEPTH,
      conversationId: 'c1',
      assistantMessageId: 'a1',
    })

    await expect(
      AgentRun.createChild(parent, {
        agentId: 'skill:child',
        parentOpts: baseOpts,
        task: 'too deep',
      }),
    ).rejects.toThrow(/nesting depth exceeded/)
  })

  it('executeChildAndMerge rejects nested HITL beyond one sub-agent level', async () => {
    vi.spyOn(resolveChildAgent, 'resolveEngineAgent').mockResolvedValue({
      id: 'skill:child',
      name: 'Child',
    } as never)

    const flow = new AgentFlow(baseOpts, {})
    const parentRun = AgentRun.forFlow(flow)

    vi.spyOn(parentRun, 'forkChild').mockResolvedValue({
      meta: { runId: 'deep-child', depth: 2, agentId: 'skill:child' },
      context: {
        hitlAwaitingApproval: true,
        hitlAwaitingFormData: false,
      },
      execute: vi.fn(async () => ({
        structuredContent: '{}',
        stepOutputs: {},
        hitlPaused: true,
        shouldPersistMemory: false,
      })),
    } as never)

    await expect(
      parentRun.executeChildAndMerge({
        agentId: 'skill:child',
        parentOpts: flow.context.opts,
        task: 'child task',
      }),
    ).rejects.toThrow(/only one level of sub-agent HITL/)
  })

  it('resumeChildFrame requires agentId', async () => {
    const flow = new AgentFlow(baseOpts, {})
    const parentRun = AgentRun.forFlow(flow)
    await expect(
      parentRun.resumeChildFrame({
        runId: 'child-resume',
        agentId: '  ',
        currentMessages: [],
        stepOutputs: {},
        stepContexts: {},
        stepHistory: [],
        collectedFormByTodoId: {},
      }),
    ).rejects.toThrow(/missing agentId/)
  })

  it('resumeChildFrame restores child state and runs pipeline', async () => {
    const flow = new AgentFlow(baseOpts, {})
    const parentRun = AgentRun.forFlow(flow)

    const childFlow = new AgentFlow(baseOpts, {})
    vi.spyOn(childFlow, 'executePipeline').mockResolvedValue('{"version":2}')
    vi.spyOn(childFlow, 'fromAgentConfig').mockReturnValue(childFlow)

    vi.spyOn(AgentRun, 'createChild').mockResolvedValue({
      meta: { runId: 'child-resume', depth: 1, agentId: 'skill:child' },
      context: childFlow.context,
      flow: childFlow,
    } as never)

    childFlow.context.sandbox.acquireForSubAgentRun = vi.fn().mockResolvedValue({
      layout: { root: '/tmp/sub-agent-sandbox' },
    } as never)
    vi.spyOn(childFlow.context.sandbox, 'syncBindingToTools').mockImplementation(() => {})
    vi.spyOn(childFlow.context.sandbox, 'syncWorkspaceToTools').mockImplementation(() => {})
    vi.spyOn(childFlow.context.sandbox, 'activateToolLoopOutputScope').mockImplementation(
      () => {},
    )

    const result = await runWithAgentRunScope(
      { runId: 'parent-run', depth: 0, sandboxRoot: '/tmp/sandbox' },
      async () =>
        parentRun.resumeChildFrame({
          runId: 'child-resume',
          agentId: 'skill:child',
          pausedStageId: 'toolLoop',
          currentMessages: [{ role: 'user', content: 'resume task' }],
          stepOutputs: {},
          stepContexts: {},
          stepHistory: [],
          nextTodoIndex: 1,
          collectedFormByTodoId: {},
        }),
    )

    expect(childFlow.executePipeline).toHaveBeenCalledWith({
      startFromStageId: 'toolLoop',
    })
    expect(result.structuredContent).toBe('{"version":2}')
  })
})
