/**
 * Integration test: ReAct pipeline with HITL pause and resume at toolLoop.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { streamAgentMock } = vi.hoisted(() => {
  const streamAgentMock = vi.fn()
  return { streamAgentMock }
})

vi.mock('../providers/stream', () => ({
  streamLlmTextToStepProgress: vi.fn().mockResolvedValue({ text: '' }),
  streamLlmObjectToStepProgress: vi.fn().mockResolvedValue({ text: '', output: {} }),
  runLlmTextSilent: vi.fn().mockResolvedValue({ text: '' }),
  runLlmObjectSilent: vi.fn().mockResolvedValue({ output: {} }),
}))

vi.mock('../steps/step-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../steps/step-helpers')>()
  return {
    ...actual,
    streamAgent: streamAgentMock,
    streamAgentWithContextRecovery: streamAgentMock,
  }
})

vi.mock('../sandbox/context', () => ({
  SandboxContext: class MockSandboxContext {
    references: unknown
    constructor(refs: unknown) {
      this.references = refs
    }
    get layout() {
      return undefined
    }
    get planning() {
      return undefined
    }
    getRoot() {
      return '/sandbox'
    }
    getConversationId() {
      return 'test-conv-id'
    }
    buildInstructionBlock() {
      return ''
    }
    buildSandboxStructureBlock() {
      return ''
    }
    buildWorkspaceStructureBlock() {
      return ''
    }
    async acquireForConversation() {
      return {}
    }
    syncBindingToTools() {}
    syncWorkspaceToTools() {}
    clearBindingFromTools() {}
    defaultToolLoopPreviewDir() {
      return ''
    }
    buildReadyPayload() {
      return { conversationId: '', sandboxRoot: '', outputResultsDir: '' }
    }
    async writeFinalResult() {
      return null
    }
    async materializePlanningReferences() {}
    activateToolLoopOutputScope() {}
    clearToolLoopOutputScope() {}
    toolLoopOutputRelBase() {
      return ''
    }
  },
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    insertTokenUsage: vi.fn(),
    getSessionApprovedTools: vi.fn(() => []),
    getConversationSettings: vi.fn(() => ({})),
  }),
}))

vi.mock('../utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils')>()
  return {
    ...actual,
    clientUiIndicatesToolApprovalResume: vi.fn(() => false),
    cloneClientUiMessages: vi.fn((m: unknown) => m),
  }
})

vi.mock('../pending/store', () => ({
  deletePendingExecution: vi.fn(),
  findPendingExecution: vi.fn(() => undefined),
  getPendingExecution: vi.fn(() => null),
  pendingExecutionStorageKey: vi.fn(() => null),
  setPendingExecution: vi.fn(),
}))

vi.mock('../form/pending-state', () => ({
  findPendingFormExecutionByRequestId: vi.fn(() => null),
}))

import { AgentFlow } from './agent-flow'
import type { AgentFlowContext } from '../context'

function makeBaseOpts() {
  return {
    provider: 'ollama' as const,
    model: 'test-model',
    systemPrompt: 'You are a test assistant.',
    messages: [{ role: 'user' as const, content: 'Run with HITL' }],
    onChunk: vi.fn(),
    userId: 'test-user',
    ollamaBaseURL: 'http://localhost:11434',
    llamacppBaseURL: 'http://127.0.0.1:8080/v1',
    llamacppApiKey: '',
    anthropicApiKey: '',
    openaiApiKey: '',
    openaiBaseURL: '',
    geminiApiKey: '',
    deepseekApiKey: '',
    conversationId: 'test-conv-id',
    skillId: 'demo',
    executionSteps: {
      skills: 'Execute tools',
      toolLoop: { tools: [{ name: 'run_script' } as never] },
    },
  }
}

function getCtx(flow: AgentFlow): AgentFlowContext {
  return (flow as unknown as { ctx: AgentFlowContext }).ctx
}

describe('AgentFlow HITL – toolLoop', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Run 1 – pauses when streamAgent requests tool approval', async () => {
    streamAgentMock.mockResolvedValue({
      text: 'awaiting approval',
      awaitingToolApproval: true,
    })

    const flow = new AgentFlow(makeBaseOpts(), {})
    await flow.run()

    const ctx = getCtx(flow)
    expect(ctx.hitlAwaitingApproval).toBe(true)
    expect(streamAgentMock).toHaveBeenCalled()
  })

  it('Run 2 – resumes toolLoop after approval and completes', async () => {
    const { clientUiIndicatesToolApprovalResume } = await import('../utils')
    const { getPendingExecution, pendingExecutionStorageKey } =
      await import('../pending/store')

    vi.mocked(clientUiIndicatesToolApprovalResume).mockReturnValue(true)
    vi.mocked(pendingExecutionStorageKey).mockReturnValue('test-pending-key')
    vi.mocked(getPendingExecution).mockReturnValue({
      currentMessages: [{ role: 'user', content: 'Run with HITL' }],
      stepOutputs: {},
      stepContexts: {},
      stepHistory: [],
      nextTodoIndex: 0,
      collectedFormByTodoId: {},
      pausedStageId: 'toolLoop',
    })

    streamAgentMock.mockResolvedValue({
      text: 'Tool run finished',
      awaitingToolApproval: false,
    })

    const flow = new AgentFlow(makeBaseOpts(), {})
    await flow.run()

    const ctx = getCtx(flow)
    expect(ctx.hitlAwaitingApproval).toBe(false)
    expect(streamAgentMock).toHaveBeenCalled()

    vi.mocked(clientUiIndicatesToolApprovalResume).mockReturnValue(false)
    vi.mocked(getPendingExecution).mockReturnValue(null)
    vi.mocked(pendingExecutionStorageKey).mockReturnValue(null)
  })
})
