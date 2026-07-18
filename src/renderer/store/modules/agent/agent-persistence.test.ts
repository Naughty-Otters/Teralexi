/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createAgentPersistenceActions } from './agent-persistence'
import type { AgentStoreContext } from './agent-store-context'

function makeCtx(
  overrides: Partial<AgentStoreContext> = {},
): AgentStoreContext {
  return {
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    inFlightConversations: new Set(),
    uiChatInFlightConversations: new Set(),
    inFlightWaiters: new Map(),
    pendingAgentConfigSaves: new Map(),
    agents: ref([
      {
        id: 'agent-1',
        name: 'Test',
        description: '',
        model: 'm',
        provider: 'openai',
        color: '#000',
        enabled: true,
      },
    ]),
    conversations: ref({}),
    conversationMessagePagination: ref({}),
    conversationList: ref({}),
    activeConversationId: ref({}),
    focusedConversationId: ref(null),
    channelConversationIds: ref(new Set()),
    selectedAgentId: ref('agent-1'),
    activeStreamState: ref(null),
    hasLoadedSettings: ref(true),
    isLoadingInitialConversations: ref(false),
    hasLoadedInitialConversations: ref(true),
    providerSetupDismissed: ref(false),
    onboardingCompleted: ref(true),
    mcpServers: ref([]),
    mcpToolsByServer: ref({}),
    mcpToolsLoadErrorByServer: ref({}),
    conversationSandboxRuns: ref({}),
    sandboxSelectedRunIdByConversation: ref({}),
    chatBoxDisplayMode: ref('default'),
    ollamaBaseURL: ref(''),
    connectionStatus: ref('unknown'),
    llamacppBaseURL: ref(''),
    llamacppApiKey: ref(''),
    llamacppConnectionStatus: ref('unknown'),
    anthropicApiKey: ref(''),
    anthropicBaseURL: ref(''),
    openaiApiKey: ref(''),
    openaiBaseURL: ref(''),
    geminiApiKey: ref(''),
    geminiBaseURL: ref(''),
    deepseekApiKey: ref(''),
    deepseekApiUrl: ref(''),
    xaiApiKey: ref(''),
    xaiBaseURL: ref(''),
    zhipuApiKey: ref(''),
    zhipuBaseURL: ref(''),
    openAiCompatibleApiKeys: ref({} as never),
    openAiCompatibleBaseUrls: ref({} as never),
    availableModelsByProvider: ref({} as never),
    selectedAgent: ref(null) as never,
    enabledAgents: ref([]) as never,
    chatSelectableAgents: ref([]) as never,
    currentConversationId: ref(null) as never,
    currentMessages: ref([]) as never,
    isStreaming: ref(false) as never,
    currentConversationType: ref('chat') as never,
    sandboxRunsForCurrentConversation: ref([]) as never,
    selectedSandboxRunIdForCurrentConversation: ref(null) as never,
    enabledMcpTools: ref([]) as never,
    hasLlmProviderReady: ref(true) as never,
    ...overrides,
  } as AgentStoreContext
}

describe('agent-persistence negative paths', () => {
  afterEach(() => {
    delete (window as typeof window & { ipcRendererChannel?: unknown })
      .ipcRendererChannel
  })

  it('propagates UpsertAgentConfiguration IPC failure to the caller', async () => {
    const upsert = vi.fn(async () => {
      throw new Error('disk full')
    })
    ;(window as typeof window & { ipcRendererChannel?: unknown }).ipcRendererChannel =
      {
        UpsertAgentConfiguration: { invoke: upsert },
      }

    const ctx = makeCtx()
    const actions = createAgentPersistenceActions(ctx)

    await expect(actions.persistAgentConfiguration('agent-1')).rejects.toThrow(
      'disk full',
    )
    expect(upsert).toHaveBeenCalled()
  })

  it('keeps the save queue alive after a prior failure so later saves still run', async () => {
    const upsert = vi
      .fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValueOnce(undefined)
    ;(window as typeof window & { ipcRendererChannel?: unknown }).ipcRendererChannel =
      {
        UpsertAgentConfiguration: { invoke: upsert },
      }

    const ctx = makeCtx()
    const actions = createAgentPersistenceActions(ctx)

    await expect(actions.persistAgentConfiguration('agent-1')).rejects.toThrow(
      'first fail',
    )
    await expect(
      actions.persistAgentConfiguration('agent-1'),
    ).resolves.toBeUndefined()
    expect(upsert).toHaveBeenCalledTimes(2)
  })

  it('waitForPendingAgentConfigurationSave does not throw when pending save failed', async () => {
    const upsert = vi.fn(async () => {
      throw new Error('persist failed')
    })
    ;(window as typeof window & { ipcRendererChannel?: unknown }).ipcRendererChannel =
      {
        UpsertAgentConfiguration: { invoke: upsert },
      }

    const ctx = makeCtx()
    const actions = createAgentPersistenceActions(ctx)

    const pending = actions.persistAgentConfiguration('agent-1')
    await expect(
      actions.waitForPendingAgentConfigurationSave('agent-1'),
    ).resolves.toBeUndefined()
    await expect(pending).rejects.toThrow('persist failed')
  })
})
