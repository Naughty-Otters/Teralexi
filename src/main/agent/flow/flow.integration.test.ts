/**
 * Integration test for the ReAct agent flow pipeline (toolLoop).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { streamAgentMock, toolLoopStageSpy } = vi.hoisted(() => {
  const streamAgentMock = vi.fn()
  const toolLoopStageSpy = vi.fn()
  return { streamAgentMock, toolLoopStageSpy }
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

vi.mock('../expr/tool-loop-expr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../expr/tool-loop-expr')>()
  return {
    ...actual,
    executeToolLoopStage: toolLoopStageSpy,
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
      return undefined
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
    getConversationSettings: vi.fn(() => null),
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

function makeBaseOpts() {
  return {
    provider: 'ollama' as const,
    model: 'test-model',
    systemPrompt: 'You are a test assistant.',
    messages: [{ role: 'user' as const, content: 'Run the ReAct pipeline' }],
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
    xaiApiKey: '',
    conversationId: 'test-conv-id',
    skillId: 'demo',
    executionSteps: {
      skills: 'Use tools to complete tasks',
      toolLoop: { tools: [{ name: 'run_script' } as never] },
    },
  }
}

describe('AgentFlow integration – ReAct pipeline', () => {
  beforeEach(() => {
    toolLoopStageSpy.mockClear()
    streamAgentMock.mockClear()
    toolLoopStageSpy.mockResolvedValue(undefined)
  })

  it('executes the toolLoop stage', async () => {
    const flow = new AgentFlow(makeBaseOpts(), {})
    await flow.run()

    expect(toolLoopStageSpy).toHaveBeenCalledTimes(1)
  })

  it('invokes toolLoop exactly once per run', async () => {
    const flow = new AgentFlow(makeBaseOpts(), {})
    await flow.run()
    await flow.run()

    expect(toolLoopStageSpy).toHaveBeenCalledTimes(2)
  })
})
