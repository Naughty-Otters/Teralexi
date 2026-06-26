import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    saveMessage: vi.fn(),
    getMessages: vi.fn(() => []),
  }),
}))

vi.mock('@main/agent/config/context', () => ({
  ConfigContext: {
    loadEngineAgents: vi.fn(),
    ERRORS: { NOT_FOUND: 'Agent not found: {agentId}' },
    ENGINE_LOG: { PERSIST_ASSISTANT_FAIL: 'persist assistant failed' },
  },
}))

vi.mock('@main/agent/coding/plan-mode-state', () => ({
  isPlanModeActive: vi.fn(() => false),
}))

vi.mock('@main/agent/utils', () => ({
  extractLastUserForPersistence: vi.fn(() => null),
  extractTrailingUserForPersistence: vi.fn(() => null),
  loadAgentRunCredentials: vi.fn(() => ({})),
  loadConversationHistory: vi.fn(() => []),
  loadMcpToolsForAgent: vi.fn(async () => []),
  parseClientUiMessages: vi.fn(() => []),
  resolveEnabledSkillToolNames: vi.fn(() => []),
}))

vi.mock('@main/agent/agent-stream-bridge', () => ({
  createAgentStreamBridge: vi.fn(() => ({
    onChunk: vi.fn(),
    onUIMessageChunk: vi.fn(),
    onStepProgress: vi.fn(),
    onSubAgentRunEvent: vi.fn(),
    onSandboxReady: vi.fn(),
    onSandboxResultWritten: vi.fn(),
    notifyFinished: vi.fn(),
  })),
}))

vi.mock('@main/agent/bus/agent-event-bus', () => ({
  createAgentEventBus: vi.fn(() => ({})),
}))

vi.mock('@main/agent/bus/ipc-projector', () => ({
  attachIpcProjector: vi.fn(() => vi.fn()),
}))

vi.mock('@logging', () => ({
  runWithAgentRunLog: vi.fn((_ctx, fn) => fn()),
}))

vi.mock('@main/agent/llm/llm-debug-writer', () => ({
  createLlmDebugRunId: vi.fn(() => 'debug-run'),
}))

vi.mock('@main/services/web-content-send', () => ({
  webContentSend: { ConversationStoreChanged: vi.fn() },
}))

const executeChildAndMerge = vi.fn()
vi.mock('@main/agent/run/agent-run', () => ({
  AgentRun: {
    startRoot: vi.fn(() => ({
      executeChildAndMerge,
    })),
  },
}))

vi.mock('@main/agent/providers/stage-model-registry', () => ({
  StageModelRegistry: {
    fromOpts: vi.fn(() => ({
      getModel: vi.fn(() => ({})),
    })),
  },
}))

vi.mock('@main/agent/run/resolve-child-agent', () => ({
  mergeSubFlowOutputText: vi.fn(() => 'Sub-agent report'),
}))

import { ConfigContext } from '@main/agent/config/context'
import { isPlanModeActive } from '@main/agent/coding/plan-mode-state'
import { runSubAgentMentionDelegation } from './conversation'

describe('runSubAgentMentionDelegation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isPlanModeActive).mockReturnValue(false)
    executeChildAndMerge.mockResolvedValue({
      hitlPaused: false,
      stepOutputs: { report: 'Sub-agent report' },
    })
    vi.mocked(ConfigContext.loadEngineAgents).mockResolvedValue([
      {
        id: 'main',
        name: 'Main',
        allowSubAgents: true,
        subAgentIds: ['coding'],
        provider: 'openai',
        model: 'gpt-4',
        systemPrompt: '',
        stageLlmSettings: {},
        executionSteps: {},
        toolLoopMaxIterations: 10,
        availableSkillTools: [],
        availableSetTouched: false,
        toolNeedsApprovalOverrides: {},
      },
      {
        id: 'coding',
        name: 'Code',
        allowAsSubAgent: true,
        provider: 'openai',
        model: 'gpt-4',
        systemPrompt: '',
        stageLlmSettings: {},
        executionSteps: {},
        toolLoopMaxIterations: 10,
        availableSkillTools: [],
        availableSetTouched: false,
        toolNeedsApprovalOverrides: {},
      },
    ] as never)
  })

  it('rejects targets not in the caller allow-list', async () => {
    const result = await runSubAgentMentionDelegation({
      conversationId: 'conv-1',
      agentId: 'main',
      assistantMessageId: 'asst-1',
      userId: 'user-1',
      targetAgentId: 'research',
      task: 'Do research',
    })

    expect(result.hasError).toBe(true)
    expect(result.errorMessage).toMatch(/not enabled/)
    expect(executeChildAndMerge).not.toHaveBeenCalled()
  })

  it('delegates to an allowed target', async () => {
    const result = await runSubAgentMentionDelegation({
      conversationId: 'conv-1',
      agentId: 'main',
      assistantMessageId: 'asst-1',
      userId: 'user-1',
      targetAgentId: 'coding',
      task: 'Build a site',
    })

    expect(result.hasError).toBe(false)
    expect(result.finalContent).toBe('Sub-agent report')
    expect(executeChildAndMerge).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'coding',
        task: 'Build a site',
      }),
    )
  })

  it('blocks delegation while plan mode is active', async () => {
    vi.mocked(isPlanModeActive).mockReturnValue(true)

    const result = await runSubAgentMentionDelegation({
      conversationId: 'conv-1',
      agentId: 'main',
      assistantMessageId: 'asst-1',
      userId: 'user-1',
      targetAgentId: 'coding',
      task: 'Build a site',
    })

    expect(result.hasError).toBe(true)
    expect(result.errorMessage).toMatch(/plan mode/)
    expect(executeChildAndMerge).not.toHaveBeenCalled()
  })
})
