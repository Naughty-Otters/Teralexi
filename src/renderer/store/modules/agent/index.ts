import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import {
  classifyConversationSessionId,
} from '@shared/conversation/session-id'
import { isWorkflowPanelAgentId } from '@shared/skills/workflow-panel-skills'
import { normalizeLlamaCppBaseURL } from '@shared/agent/llamacpp-url'
import {
  hasAnyLlmProviderConfigured,
  isLlmProviderConfigured,
} from '@shared/agent/provider-setup-status'
import {
  areAllAgentsReadyForOnboarding,
  type OnboardingAgentSnapshot,
} from '@shared/agent/onboarding-status'
import { LLM_PROVIDER_IDS } from '@shared/agent/llm-provider-registry'
import { createLogger } from '@renderer/utils/logger'
import {
  resolveUiChatBoxDisplayMode,
  type ChatBoxDisplayMode,
  usesStructuredAssistantRendering,
} from '@renderer/views/agent-chat/chatBoxDisplayMode'
import type { AgentStoreContext } from './agent-store-context'
import {
  createInitialModelsByProvider,
  createInitialOpenAiCompatibleApiKeys,
  createInitialOpenAiCompatibleBaseUrls,
} from './initial-state'
export type { ProviderConnectionTestResult } from './initial-state'
import { createAgentPersistenceActions } from './agent-persistence'
import { createAgentMutationsActions } from './agent-mutations'
import { createSandboxActions } from './sandbox-actions'
import { createConversationActions } from './conversation-actions'
import { createLlmProviderActions } from './llm-providers'
import type { SettingsInitDeps } from './settings-init'
import type {
  Agent,
  Message,
  Conversation,
  ConversationSandboxRun,
  ProviderType,
  McpTransportType,
  McpServerDefinition,
  McpToolDefinition,
  AgentExecutionSteps,
  RuntimeToolMeta,
} from './types'

const log = createLogger('renderer.agent-store')

export const useAgentStore = defineStore('agent', () => {
  const inFlightConversations = new Set<string>()
  const uiChatInFlightConversations = new Set<string>()
  const inFlightWaiters = new Map<string, Array<() => void>>()
  const pendingAgentConfigSaves = new Map<string, Promise<void>>()

  const agents = ref<Agent[]>([])
  const conversations = ref<Record<string, Message[]>>({})
  const conversationMessagePagination = ref<
    Record<string, { hasOlder: boolean }>
  >({})
  const conversationList = ref<Record<string, Conversation[]>>({})
  const activeConversationId = ref<Record<string, string>>({})
  const focusedConversationId = ref<string | null>(null)
  const channelConversationIds = ref<Set<string>>(new Set())
  const selectedAgentId = ref<string | null>(null)
  const activeStreamState = ref<{
    conversationId: string
    assistantId: string
    abortController: AbortController
  } | null>(null)
  const hasLoadedSettings = ref(false)
  const isLoadingInitialConversations = ref(false)
  const hasLoadedInitialConversations = ref(false)
  const providerSetupDismissed = ref(false)
  const onboardingCompleted = ref(false)
  const mcpServers = ref<McpServerDefinition[]>([])
  const mcpToolsByServer = ref<Record<string, McpToolDefinition[]>>({})
  const mcpToolsLoadErrorByServer = ref<Record<string, string>>({})
  const conversationSandboxRuns = ref<Record<string, ConversationSandboxRun[]>>(
    {},
  )
  const sandboxSelectedRunIdByConversation = ref<Record<string, string>>({})
  const chatBoxDisplayMode = ref<ChatBoxDisplayMode>(
    resolveUiChatBoxDisplayMode(),
  )

  const ollamaBaseURL = ref('http://localhost:11434')
  const connectionStatus = ref<'unknown' | 'connected' | 'error'>('unknown')
  const llamacppBaseURL = ref(normalizeLlamaCppBaseURL(''))
  const llamacppApiKey = ref('')
  const llamacppConnectionStatus = ref<'unknown' | 'connected' | 'error'>(
    'unknown',
  )
  const anthropicApiKey = ref('')
  const anthropicBaseURL = ref('https://api.anthropic.com/v1')
  const openaiApiKey = ref('')
  const openaiBaseURL = ref('https://api.openai.com/v1')
  const geminiApiKey = ref('')
  const geminiBaseURL = ref(
    'https://generativelanguage.googleapis.com/v1beta',
  )
  const deepseekApiKey = ref('')
  const deepseekApiUrl = ref('https://api.deepseek.com/v1')
  const zhipuApiKey = ref('')
  const zhipuBaseURL = ref('https://api.z.ai/api/paas/v4')
  const openAiCompatibleApiKeys = ref(createInitialOpenAiCompatibleApiKeys())
  const openAiCompatibleBaseUrls = ref(createInitialOpenAiCompatibleBaseUrls())
  const availableModelsByProvider = ref<Record<ProviderType, string[]>>(
    createInitialModelsByProvider(),
  )

  const selectedAgent = computed(
    () => agents.value.find((a) => a.id === selectedAgentId.value) ?? null,
  )
  const enabledAgents = computed(() => agents.value.filter((a) => a.enabled))
  const chatSelectableAgents = computed(() =>
    enabledAgents.value.filter((agent) => !isWorkflowPanelAgentId(agent.id)),
  )
  const currentConversationId = computed((): string | null => {
    return focusedConversationId.value
  })
  const currentMessages = computed((): Message[] => {
    const convId = currentConversationId.value
    return convId ? (conversations.value[convId] ?? []) : []
  })
  const isStreaming = computed(() => {
    const msgs = currentMessages.value
    return msgs.length > 0 && !!msgs[msgs.length - 1].isStreaming
  })
  const currentConversationType = computed((): Conversation['type'] => {
    const convId = currentConversationId.value
    if (!convId) return 'ui'
    return classifyConversationSessionId(convId)
  })
  const sandboxRunsForCurrentConversation = computed(
    (): ConversationSandboxRun[] => {
      const convId = currentConversationId.value
      return convId ? (conversationSandboxRuns.value[convId] ?? []) : []
    },
  )
  const selectedSandboxRunIdForCurrentConversation = computed(
    (): string | null => {
      const convId = currentConversationId.value
      if (!convId) return null
      return sandboxSelectedRunIdByConversation.value[convId] ?? null
    },
  )
  const uiConversationList = computed((): Record<string, Conversation[]> => {
    const result: Record<string, Conversation[]> = {}
    for (const [agentId, convs] of Object.entries(conversationList.value)) {
      result[agentId] = convs.filter((c) => c.type === 'ui')
    }
    return result
  })
  const channelConversationList = computed(
    (): Record<string, Conversation[]> => {
      const result: Record<string, Conversation[]> = {}
      for (const [agentId, convs] of Object.entries(conversationList.value)) {
        result[agentId] = convs.filter((c) => c.type === 'channel')
      }
      return result
    },
  )
  const enabledMcpTools = computed<RuntimeToolMeta[]>(() => {
    const merged: RuntimeToolMeta[] = []
    for (const server of mcpServers.value) {
      if (!server.enabled) continue
      const tools = mcpToolsByServer.value[server.id] ?? []
      for (const tool of tools) {
        merged.push({
          source: 'mcp',
          name: `mcp.${server.name}.${tool.name}`,
          description: `[MCP:${server.name}] ${tool.description || tool.name}`,
          inputSchema: tool.inputSchema,
          needsApproval: false,
          serverId: server.id,
          toolName: tool.name,
        })
      }
    }
    return merged
  })
  const assistantStructuredDebugEnabled = computed({
    get: () => usesStructuredAssistantRendering(chatBoxDisplayMode.value),
    set: (enabled: boolean) => {
      if (enabled && chatBoxDisplayMode.value === 'brief') {
        chatBoxDisplayMode.value = 'timeline'
      } else if (!enabled) {
        chatBoxDisplayMode.value = 'brief'
      }
    },
  })

  const ctx = {
    log,
    inFlightConversations,
    uiChatInFlightConversations,
    inFlightWaiters,
    pendingAgentConfigSaves,
    agents,
    conversations,
    conversationMessagePagination,
    conversationList,
    activeConversationId,
    focusedConversationId,
    channelConversationIds,
    selectedAgentId,
    activeStreamState,
    hasLoadedSettings,
    isLoadingInitialConversations,
    hasLoadedInitialConversations,
    providerSetupDismissed,
    onboardingCompleted,
    mcpServers,
    mcpToolsByServer,
    mcpToolsLoadErrorByServer,
    conversationSandboxRuns,
    sandboxSelectedRunIdByConversation,
    chatBoxDisplayMode,
    ollamaBaseURL,
    connectionStatus,
    llamacppBaseURL,
    llamacppApiKey,
    llamacppConnectionStatus,
    anthropicApiKey,
    anthropicBaseURL,
    openaiApiKey,
    openaiBaseURL,
    geminiApiKey,
    geminiBaseURL,
    deepseekApiKey,
    deepseekApiUrl,
    zhipuApiKey,
    zhipuBaseURL,
    openAiCompatibleApiKeys,
    openAiCompatibleBaseUrls,
    availableModelsByProvider,
    selectedAgent,
    enabledAgents,
    chatSelectableAgents,
    currentConversationId,
    currentMessages,
    isStreaming,
    currentConversationType,
    sandboxRunsForCurrentConversation,
    selectedSandboxRunIdForCurrentConversation,
    enabledMcpTools,
    hasLlmProviderReady: computed(() => false),
    configuredLlmProviderIds: computed((): ProviderType[] => []),
    areAllAgentsLlmReady: computed(() => false),
    shouldShowProviderSetupWizard: computed(() => false),
    shouldRequireFirstTimeRampUp: computed(() => false),
    assistantStructuredDebugEnabled,
  } as AgentStoreContext

  const persistence = createAgentPersistenceActions(ctx)
  const mutations = createAgentMutationsActions(ctx, persistence)
  const sandbox = createSandboxActions(ctx)
  const conversation = createConversationActions(ctx, persistence)
  const llm = createLlmProviderActions(ctx, mutations)

  const hasLlmProviderReady = computed(() =>
    hasAnyLlmProviderConfigured(llm.buildLlmCredentialsSnapshot()),
  )
  const configuredLlmProviderIds = computed(() =>
    (LLM_PROVIDER_IDS as readonly ProviderType[]).filter((id) =>
      isLlmProviderConfigured(id, llm.buildLlmCredentialsSnapshot()),
    ),
  )
  const onboardingAgentSnapshots = computed((): OnboardingAgentSnapshot[] =>
    agents.value.map((agent) => ({
      provider: agent.provider,
      model: agent.model,
      llmRoutingMode: agent.llmRoutingMode,
      stageLlm: agent.stageLlm,
    })),
  )
  const areAllAgentsLlmReady = computed(() =>
    areAllAgentsReadyForOnboarding(
      onboardingAgentSnapshots.value,
      llm.buildLlmCredentialsSnapshot(),
    ),
  )
  const shouldShowProviderSetupWizard = computed(
    () =>
      onboardingCompleted.value &&
      !providerSetupDismissed.value &&
      !hasLlmProviderReady.value,
  )
  const shouldRequireFirstTimeRampUp = computed(
    () => !onboardingCompleted.value,
  )

  ctx.hasLlmProviderReady = hasLlmProviderReady
  ctx.configuredLlmProviderIds = configuredLlmProviderIds
  ctx.areAllAgentsLlmReady = areAllAgentsLlmReady
  ctx.shouldShowProviderSetupWizard = shouldShowProviderSetupWizard
  ctx.shouldRequireFirstTimeRampUp = shouldRequireFirstTimeRampUp

  async function loadSkillsFromDisk(): Promise<boolean> {
    const m = await import('./agent-skills')
    return m.loadSkillsFromDisk(ctx, persistence)
  }

  async function loadMcpServers(opts?: {
    fetchTools?: boolean
  }): Promise<void> {
    const m = await import('./agent-mcp-servers')
    return m.loadMcpServers(ctx, opts)
  }

  let assistantRunPromise: Promise<
    ReturnType<typeof import('./assistant-run').createAssistantRunActions>
  > | null = null

  async function getAssistantRunActions() {
    if (!assistantRunPromise) {
      assistantRunPromise = import('./assistant-run').then((m) =>
        m.createAssistantRunActions(ctx, persistence, conversation, {
          loadSkillsFromDisk,
        }),
      )
    }
    return assistantRunPromise
  }

  async function runAssistantForConversation(
    ...args: Parameters<
      Awaited<ReturnType<typeof getAssistantRunActions>>['runAssistantForConversation']
    >
  ) {
    const actions = await getAssistantRunActions()
    return actions.runAssistantForConversation(...args)
  }

  async function sendMessage(content: string) {
    const actions = await getAssistantRunActions()
    return actions.sendMessage(content)
  }

  async function handleChannelIncomingToAgent(
    args: Parameters<
      Awaited<ReturnType<typeof getAssistantRunActions>>['handleChannelIncomingToAgent']
    >[0],
  ) {
    const actions = await getAssistantRunActions()
    return actions.handleChannelIncomingToAgent(args)
  }

  let mcpActionsPromise: Promise<
    ReturnType<typeof import('./agent-mcp-servers').createMcpServerActions>
  > | null = null

  async function getMcpActions() {
    if (!mcpActionsPromise) {
      mcpActionsPromise = import('./agent-mcp-servers').then((m) =>
        m.createMcpServerActions(ctx),
      )
    }
    return mcpActionsPromise
  }

  async function loadMcpToolsForEnabledServers(): Promise<void> {
    const actions = await getMcpActions()
    return actions.loadMcpToolsForEnabledServers()
  }

  async function addMcpServer(
    input: Parameters<
      Awaited<ReturnType<typeof getMcpActions>>['addMcpServer']
    >[0],
  ) {
    const actions = await getMcpActions()
    return actions.addMcpServer(input)
  }

  async function toggleMcpServerEnabled(serverId: string) {
    const actions = await getMcpActions()
    return actions.toggleMcpServerEnabled(serverId)
  }

  async function deleteMcpServer(serverId: string) {
    const actions = await getMcpActions()
    return actions.deleteMcpServer(serverId)
  }

  async function fetchMcpServerTools(serverId: string) {
    const actions = await getMcpActions()
    return actions.fetchMcpServerTools(serverId)
  }

  type SettingsActions = ReturnType<
    typeof import('./settings-init').createSettingsInitActions
  >
  let settingsPromise: Promise<SettingsActions> | null = null

  async function getSettingsActions() {
    if (!settingsPromise) {
      settingsPromise = import('./settings-init').then((m) =>
        m.createSettingsInitActions(ctx, conversation, {
          loadSkillsFromDisk,
        } satisfies SettingsInitDeps),
      )
    }
    return settingsPromise
  }

  async function initializeSettingsFromConfig() {
    const settings = await getSettingsActions()
    return settings.initializeSettingsFromConfig()
  }

  async function loadInitialConversations() {
    const settings = await getSettingsActions()
    return settings.loadInitialConversations()
  }

  async function loadAllConversationLists() {
    const settings = await getSettingsActions()
    return settings.loadAllConversationLists()
  }

  watch(
    () => currentConversationId.value,
    sandbox.syncSandboxSelectionForCurrentConversation,
    { immediate: true },
  )
  watch(
    conversationSandboxRuns,
    sandbox.syncSandboxSelectionForCurrentConversation,
    { deep: true },
  )

  return {
    hasLoadedSettings,
    isLoadingInitialConversations,
    hasLoadedInitialConversations,
    providerSetupDismissed,
    onboardingCompleted,
    hasLlmProviderReady,
    configuredLlmProviderIds,
    areAllAgentsLlmReady,
    shouldShowProviderSetupWizard,
    shouldRequireFirstTimeRampUp,
    dismissProviderSetupWizard: llm.dismissProviderSetupWizard,
    completeOnboarding: llm.completeOnboarding,
    applyLlmDefaultsToAllAgents: llm.applyLlmDefaultsToAllAgents,
    testProviderConnection: llm.testProviderConnection,
    agents,
    conversations,
    selectedAgentId,
    selectedAgent,
    enabledAgents,
    chatSelectableAgents,
    currentMessages,
    isStreaming,
    ollamaBaseURL,
    connectionStatus,
    llamacppBaseURL,
    llamacppApiKey,
    llamacppConnectionStatus,
    anthropicApiKey,
    anthropicBaseURL,
    openaiApiKey,
    openaiBaseURL,
    geminiApiKey,
    geminiBaseURL,
    deepseekApiKey,
    deepseekApiUrl,
    zhipuApiKey,
    zhipuBaseURL,
    openAiCompatibleApiKeys,
    openAiCompatibleBaseUrls,
    availableModelsByProvider,
    mcpServers,
    mcpToolsByServer,
    mcpToolsLoadErrorByServer,
    enabledMcpTools,
    selectAgent: conversation.selectAgent,
    initializeSettingsFromConfig,
    loadInitialConversations,
    loadSkillsFromDisk,
    loadMcpServers,
    loadMcpToolsForEnabledServers,
    sendMessage,
    handleChannelIncomingToAgent,
    checkConnection: llm.checkConnection,
    checkLlamaCppConnection: llm.checkLlamaCppConnection,
    fetchModels: llm.fetchModels,
    fetchModelsForProvider: llm.fetchModelsForProvider,
    updateOllamaURL: llm.updateOllamaURL,
    updateLlamaCppURL: llm.updateLlamaCppURL,
    updateLlamaCppApiKey: llm.updateLlamaCppApiKey,
    updateAnthropicApiKey: llm.updateAnthropicApiKey,
    updateAnthropicBaseURL: llm.updateAnthropicBaseURL,
    updateOpenAIApiKey: llm.updateOpenAIApiKey,
    updateOpenAIBaseURL: llm.updateOpenAIBaseURL,
    updateGeminiApiKey: llm.updateGeminiApiKey,
    updateGeminiBaseURL: llm.updateGeminiBaseURL,
    updateDeepSeekApiKey: llm.updateDeepSeekApiKey,
    updateDeepSeekApiUrl: llm.updateDeepSeekApiUrl,
    updateZhipuApiKey: llm.updateZhipuApiKey,
    updateZhipuBaseURL: llm.updateZhipuBaseURL,
    getOpenAiCompatibleApiKey: llm.getOpenAiCompatibleApiKey,
    getOpenAiCompatibleBaseUrl: llm.getOpenAiCompatibleBaseUrl,
    updateOpenAiCompatibleApiKey: llm.updateOpenAiCompatibleApiKey,
    updateOpenAiCompatibleBaseUrl: llm.updateOpenAiCompatibleBaseUrl,
    addMcpServer,
    toggleMcpServerEnabled,
    deleteMcpServer,
    fetchMcpServerTools,
    updateAgentModel: mutations.updateAgentModel,
    updateAgentName: mutations.updateAgentName,
    updateAgentDescription: mutations.updateAgentDescription,
    updateAgentColor: mutations.updateAgentColor,
    updateAgentSkillsPrompt: mutations.updateAgentSkillsPrompt,
    updateAgentAvailableSet: mutations.updateAgentAvailableSet,
    updateAgentAvailableSetTouched: mutations.updateAgentAvailableSetTouched,
    updateAgentToolNeedsApprovalOverrides:
      mutations.updateAgentToolNeedsApprovalOverrides,
    updateAgentAvailableMcpServers: mutations.updateAgentAvailableMcpServers,
    updateAgentToolLoopMaxIterations: mutations.updateAgentToolLoopMaxIterations,
    updateAgentTodoMaxRetries: mutations.updateAgentTodoMaxRetries,
    updateAgentAllowAsSubAgent: mutations.updateAgentAllowAsSubAgent,
    updateAgentSubAgentDelegation: mutations.updateAgentSubAgentDelegation,
    updateAgentProvider: mutations.updateAgentProvider,
    updateAgentLlmRoutingMode: mutations.updateAgentLlmRoutingMode,
    updateAgentStageLlm: mutations.updateAgentStageLlm,
    addAgent: mutations.addAgent,
    removeAgent: mutations.removeAgent,
    toggleAgentEnabled: mutations.toggleAgentEnabled,
    conversationList,
    activeConversationId,
    focusedConversationId,
    currentConversationId,
    currentConversationType,
    uiConversationList,
    channelConversationList,
    channelConversationIds,
    loadConversationList: conversation.loadConversationList,
    loadConversationMessages: conversation.loadConversationMessages,
    refreshConversationMessagesTail: conversation.refreshConversationMessagesTail,
    loadOlderConversationMessages: conversation.loadOlderConversationMessages,
    conversationHasOlderMessages: conversation.conversationHasOlderMessages,
    selectConversation: conversation.selectConversation,
    createNewConversation: conversation.createNewConversation,
    loadAllConversationLists,
    renameConversation: conversation.renameConversation,
    deleteConversation: conversation.deleteConversation,
    clearConversationHistory: conversation.clearConversationHistory,
    conversationSandboxRuns,
    sandboxRunsForCurrentConversation,
    selectedSandboxRunIdForCurrentConversation,
    recordSandboxOutput: sandbox.recordSandboxOutput,
    setSelectedSandboxRunId: sandbox.setSelectedSandboxRunId,
    markAssistantMessageFinished: conversation.markAssistantMessageFinished,
    markUiChatInFlight: conversation.markUiChatInFlight,
    isConversationStreamActive: conversation.isConversationStreamActive,
    stopStreaming: conversation.stopStreaming,
    chatBoxDisplayMode,
    assistantStructuredDebugEnabled,
  }
})

export type {
  Agent,
  Message,
  Conversation,
  ConversationSandboxRun,
  ProviderType,
  McpTransportType,
  McpServerDefinition,
  McpToolDefinition,
  AgentExecutionSteps,
  RuntimeToolMeta,
} from './types'
