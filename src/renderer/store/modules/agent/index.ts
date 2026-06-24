import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { SkillTool } from '@main/skills/types'
import { applyCodingDirectToolLoopPolicy } from '@shared/agent/coding-agent-pipeline'
import { normalizeExecutionSteps } from '@shared/agent/execution-steps'
import {
  applySubAgentSettingsToExecutionSteps,
  DEFAULT_ALLOW_AS_SUB_AGENT,
  DEFAULT_ALLOW_SUB_AGENTS,
  resolveAllowAsSubAgent,
  resolveAllowSubAgents,
} from '@shared/agent/sub-agent-settings'
import {
  expandSkillSubAgentAvailableSet,
  mergeSkillSubAgentApprovalOverrides,
} from '@shared/agent/skill-sub-agent-tool-defaults'
import {
  resolveSkillAgentConfiguration,
  skillAgentPromptsNeedSeed,
} from '@shared/agent/skill-prompts'
import {
  clampTodoMaxRetries,
  clampToolLoopMaxIterations,
  DEFAULT_TODO_MAX_RETRIES,
  DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
} from '@shared/agent/tool-loop'
import {
  expandRunScriptApprovalOverrides,
  reconcileAvailableSetWithCatalog,
  resolveSkillAvailableSet,
} from '@shared/agent/tool-selection'
import {
  expandSkillWorkspaceAvailableSet,
  mergeSkillWorkspaceApprovalOverrides,
} from '@shared/agent/skill-workspace-tool-defaults'
import { withMandatoryToolsInCatalog } from '@shared/agent/mandatory-tools'
import { isAbortError } from '@shared/utils/abort-error'
import {
  classifyConversationSessionId,
  isBoundSessionId,
} from '@shared/conversation/session-id'
import { isWorkflowPanelAgentId } from '@shared/skills/workflow-panel-skills'
import { randomShortUuid } from '@shared/utils/short-uuid'
import { normalizeLlamaCppBaseURL } from '@shared/agent/llamacpp-url'
import {
  hasAnyLlmProviderConfigured,
  isLlmProviderConfigured,
  type LlmProviderCredentialsSnapshot,
} from '@shared/agent/provider-setup-status'
import {
  areAllAgentsReadyForOnboarding,
  type OnboardingAgentSnapshot,
} from '@shared/agent/onboarding-status'
import {
  isOpenAiCompatibleProvider,
  LLM_PROVIDER_IDS,
  OPENAI_COMPATIBLE_LLM_PROVIDERS,
  OPENAI_COMPATIBLE_PROVIDER_IDS,
  openAiCompatibleProviderConfigKeys,
  type OpenAiCompatibleProviderId,
} from '@shared/agent/llm-provider-registry'
import { createLogger } from '@renderer/utils/logger'
import { useWorkspaceStore } from '@store/workspace'
import {
  ANTHROPIC_MODELS,
  DEEPSEEK_MODELS,
  ZHIPU_MODELS,
  SYSTEM_PROP_KEYS,
  PROVIDER_SETUP_DISMISSED_KEY,
  ONBOARDING_COMPLETED_KEY,
  normalizeBaseURL,
  setSystemConfigValue,
  getSystemConfigValues,
  DEFAULT_USER_ID,
} from './config'
import { markOnboardingCompleteInRouteCache } from '@renderer/lib/onboarding-route-state'
import {
  resolveUiChatBoxDisplayMode,
  type ChatBoxDisplayMode,
  usesStructuredAssistantRendering,
} from '@renderer/views/agent-chat/chatBoxDisplayMode'
import {
  mergeStreamingTextIntoStructuredContent,
  serializeAssistantMessageForExternalReply,
  serializeAssistantMessageForHistory,
} from './context'
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
  AgentSkillToolMeta,
  RuntimeToolMeta,
} from './types'
type AgentColor = Agent['color']

function createInitialModelsByProvider(): Record<ProviderType, string[]> {
  const out = {} as Record<ProviderType, string[]>
  for (const id of LLM_PROVIDER_IDS) {
    if (id === 'anthropic') out[id] = [...ANTHROPIC_MODELS]
    else if (id === 'deepseek') out[id] = [...DEEPSEEK_MODELS]
    else if (id === 'zhipu') out[id] = [...ZHIPU_MODELS]
    else if (isOpenAiCompatibleProvider(id)) {
      out[id] = [...OPENAI_COMPATIBLE_LLM_PROVIDERS[id].defaultModels]
    } else out[id] = []
  }
  return out
}

function createInitialOpenAiCompatibleApiKeys(): Record<
  OpenAiCompatibleProviderId,
  string
> {
  return Object.fromEntries(
    OPENAI_COMPATIBLE_PROVIDER_IDS.map((id) => [id, '']),
  ) as Record<OpenAiCompatibleProviderId, string>
}

function createInitialOpenAiCompatibleBaseUrls(): Record<
  OpenAiCompatibleProviderId,
  string
> {
  return Object.fromEntries(
    OPENAI_COMPATIBLE_PROVIDER_IDS.map((id) => [
      id,
      OPENAI_COMPATIBLE_LLM_PROVIDERS[id].defaultBaseUrl,
    ]),
  ) as Record<OpenAiCompatibleProviderId, string>
}
const log = createLogger('renderer.agent-store')

function syncAgentExecutionSteps(agent: Agent): void {
  agent.executionSteps = normalizeExecutionSteps(agent) as AgentExecutionSteps
  applyCodingDirectToolLoopPolicy(agent)
}

type PersistedAgentConfiguration = {
  agentId: string
  userId: string
  name: string
  description: string
  model: string
  provider: ProviderType
  color: AgentColor
  enabled: boolean
  systemPrompt: string
  skillsPrompt: string
  availableSet: string[]
  availableSetTouched: boolean
  toolNeedsApprovalOverrides: Record<string, boolean>
  availableMcpServers: string[] | null
  toolLoopMaxIterations: number
  todoMaxRetries: number
  allowAsSubAgent?: boolean
  allowSubAgents?: boolean
  subAgentIds?: string[] | null
  llmRoutingMode?: 'unified' | 'per_stage'
  stageLlm?: Partial<
    Record<
      'explore' | 'toolLoop' | 'verifier',
      { provider: ProviderType; model: string }
    >
  >
  createdAt: string
  updatedAt: string
}

export type ProviderConnectionTestResult = {
  ok: boolean
  modelCount?: number
  error?: string
}

export const useAgentStore = defineStore('agent', () => {
  const agents = ref<Agent[]>([])
  const inFlightConversations = new Set<string>()
  /** Chat panel (`@ai-sdk/vue` + IPC transport) runs not tracked by `inFlightConversations`. */
  const uiChatInFlightConversations = new Set<string>()
  const inFlightWaiters = new Map<string, Array<() => void>>()
  const pendingAgentConfigSaves = new Map<string, Promise<void>>()
  /** conversationId → messages */
  const conversations = ref<Record<string, Message[]>>({})
  const conversationMessagePagination = ref<
    Record<string, { hasOlder: boolean }>
  >({})
  /** agentId → Conversation[] (sorted newest-first) */
  const conversationList = ref<Record<string, Conversation[]>>({})
  /** agentId → active conversationId (legacy per-agent; kept in sync for IPC reloads) */
  const activeConversationId = ref<Record<string, string>>({})
  /** Conversation currently shown in chat — independent of selected agent. */
  const focusedConversationId = ref<string | null>(null)
  /** @deprecated Use {@link classifyConversationSessionId} on conversation id. */
  const channelConversationIds = ref<Set<string>>(new Set())
  const selectedAgentId = ref<string | null>(null)
  const activeStreamState = ref<{
    conversationId: string
    assistantId: string
    abortController: AbortController
  } | null>(null)
  const hasLoadedSettings = ref(false)
  const providerSetupDismissed = ref(false)
  const onboardingCompleted = ref(false)
  const mcpServers = ref<McpServerDefinition[]>([])
  const mcpToolsByServer = ref<Record<string, McpToolDefinition[]>>({})
  /** conversationId → sandbox runs (for report panel + disk cleanup on delete). */
  const conversationSandboxRuns = ref<Record<string, ConversationSandboxRun[]>>(
    {},
  )
  /** Selected sandbox tab (`sandboxRoot`) per conversation. */
  const sandboxSelectedRunIdByConversation = ref<Record<string, string>>({})

  /** Chat panel display: brief (latest step), timeline (accordion), or conversation (bubbles). */
  const chatBoxDisplayMode = ref<ChatBoxDisplayMode>(resolveUiChatBoxDisplayMode())

  /** @deprecated Prefer {@link chatBoxDisplayMode}; true when not in brief mode. */
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

  // Ollama
  const ollamaBaseURL = ref('http://localhost:11434')
  const connectionStatus = ref<'unknown' | 'connected' | 'error'>('unknown')

  // llama.cpp server (OpenAI-compatible API)
  const llamacppBaseURL = ref(normalizeLlamaCppBaseURL(''))
  const llamacppApiKey = ref('')
  const llamacppConnectionStatus = ref<'unknown' | 'connected' | 'error'>(
    'unknown',
  )

  // Provider API keys / config
  const anthropicApiKey = ref('')
  const anthropicBaseURL = ref('https://api.anthropic.com/v1')
  const openaiApiKey = ref('')
  const openaiBaseURL = ref('https://api.openai.com/v1')
  const geminiApiKey = ref('')
  const geminiBaseURL = ref('https://generativelanguage.googleapis.com/v1beta')
  const deepseekApiKey = ref('')
  const deepseekApiUrl = ref('https://api.deepseek.com/v1')
  const zhipuApiKey = ref('')
  const zhipuBaseURL = ref('https://open.bigmodel.cn/api/paas/v4')
  const openAiCompatibleApiKeys = ref(createInitialOpenAiCompatibleApiKeys())
  const openAiCompatibleBaseUrls = ref(createInitialOpenAiCompatibleBaseUrls())

  // Models per provider
  const availableModelsByProvider = ref<Record<ProviderType, string[]>>(
    createInitialModelsByProvider(),
  )

  // ── Computed ─────────────────────────────────────────────────────────────

  const selectedAgent = computed(
    () => agents.value.find((a) => a.id === selectedAgentId.value) ?? null,
  )

  const enabledAgents = computed(() => agents.value.filter((a) => a.enabled))

  /** Agents selectable in the chat composer (workflow panel skills excluded). */
  const chatSelectableAgents = computed(() =>
    enabledAgents.value.filter((agent) => !isWorkflowPanelAgentId(agent.id)),
  )

  const currentConversationId = computed((): string | null => {
    return focusedConversationId.value
  })

  function findConversationMeta(
    conversationId: string,
  ): Conversation | undefined {
    for (const convs of Object.values(conversationList.value)) {
      const hit = convs.find((c) => c.id === conversationId)
      if (hit) return hit
    }
    return undefined
  }

  function mostRecentConversation(): Conversation | null {
    const all = Object.values(conversationList.value).flat()
    if (all.length === 0) return null
    return (
      all
        .slice()
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ??
      null
    )
  }

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

  function recordSandboxOutput(payload: {
    conversationId: string
    sandboxRoot: string
    resultsFileUrl: string
    outputResultsDir: string
  }) {
    const cid = payload.conversationId
    const prev = conversationSandboxRuns.value[cid] ?? []
    const id = payload.sandboxRoot
    const idx = prev.findIndex((r) => r.id === id)

    const tab: ConversationSandboxRun = {
      id,
      label: idx >= 0 ? prev[idx]!.label : `Run ${prev.length + 1}`,
      resultsFileUrl: payload.resultsFileUrl,
      outputResultsDir: payload.outputResultsDir,
      sandboxRoot: payload.sandboxRoot,
    }

    if (idx >= 0) {
      const next = [...prev]
      next[idx] = tab
      conversationSandboxRuns.value = {
        ...conversationSandboxRuns.value,
        [cid]: next,
      }
    } else {
      conversationSandboxRuns.value = {
        ...conversationSandboxRuns.value,
        [cid]: [...prev, tab],
      }
      sandboxSelectedRunIdByConversation.value = {
        ...sandboxSelectedRunIdByConversation.value,
        [cid]: id,
      }
    }
  }

  function setSelectedSandboxRunId(runId: string) {
    const cid = currentConversationId.value
    if (!cid) return
    sandboxSelectedRunIdByConversation.value = {
      ...sandboxSelectedRunIdByConversation.value,
      [cid]: runId,
    }
  }

  function syncSandboxSelectionForCurrentConversation() {
    const cid = currentConversationId.value
    if (!cid) return
    const runs = conversationSandboxRuns.value[cid] ?? []
    if (!runs.length) return
    const sel = sandboxSelectedRunIdByConversation.value[cid]
    if (!sel || !runs.some((r) => r.id === sel)) {
      sandboxSelectedRunIdByConversation.value = {
        ...sandboxSelectedRunIdByConversation.value,
        [cid]: runs[runs.length - 1].id,
      }
    }
  }

  watch(
    () => currentConversationId.value,
    syncSandboxSelectionForCurrentConversation,
    { immediate: true },
  )

  watch(conversationSandboxRuns, syncSandboxSelectionForCurrentConversation, {
    deep: true,
  })

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

  function stopStreaming() {
    const state = activeStreamState.value
    if (!state) return

    // Delegate stop to main process engine
    void window.ipcRendererChannel?.StopAgentForConversation?.invoke?.({
      conversationId: state.conversationId,
    })

    markAssistantMessageFinished(state.conversationId, state.assistantId)

    activeStreamState.value = null
  }

  function markUiChatInFlight(conversationId: string, inFlight: boolean): void {
    if (!conversationId.trim()) return
    if (inFlight) uiChatInFlightConversations.add(conversationId)
    else uiChatInFlightConversations.delete(conversationId)
  }

  function isConversationStreamActive(conversationId: string): boolean {
    return (
      inFlightConversations.has(conversationId) ||
      uiChatInFlightConversations.has(conversationId) ||
      activeStreamState.value?.conversationId === conversationId
    )
  }

  function markAssistantMessageFinished(
    conversationId: string,
    assistantId: string,
  ) {
    const conversation = conversations.value[conversationId] ?? []
    const msg = conversation.find((item) => item.id === assistantId)
    if (msg) {
      msg.isStreaming = false
    }

    // Be defensive: if the exact object was replaced during a refresh,
    // clear any lingering streaming flags in the same conversation.
    for (const item of conversation) {
      if (item.isStreaming) item.isStreaming = false
    }

    if (activeStreamState.value?.assistantId === assistantId) {
      activeStreamState.value = null
    }
  }

  async function persistAgentConfiguration(agentId: string): Promise<void> {
    const previous = pendingAgentConfigSaves.get(agentId) ?? Promise.resolve()
    const next = previous
      .catch(() => {
        // Keep queue alive even if a previous save failed.
      })
      .then(async () => {
        const channel = window.ipcRendererChannel?.UpsertAgentConfiguration
        if (!channel?.invoke) return

        const agent = agents.value.find((item) => item.id === agentId)
        if (!agent) return

        await channel.invoke({
          agentId: agent.id,
          userId: DEFAULT_USER_ID,
          name: agent.name,
          description: agent.description,
          model: agent.model,
          provider: agent.provider,
          color: agent.color,
          enabled: agent.enabled,
          systemPrompt: '',
          skillsPrompt: agent.skillsPrompt ?? '',
          availableSet: [...(agent.availableSet ?? [])],
          availableSetTouched: !!agent.availableSetTouched,
          toolNeedsApprovalOverrides: {
            ...(agent.toolNeedsApprovalOverrides ?? {}),
          },
          availableMcpServers: agent.availableMcpServers ?? null,
          toolLoopMaxIterations: clampToolLoopMaxIterations(
            agent.toolLoopMaxIterations ??
              agent.executionSteps?.toolLoop?.maxIterations ??
              DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
          ),
          todoMaxRetries: clampTodoMaxRetries(
            agent.todoMaxRetries ?? DEFAULT_TODO_MAX_RETRIES,
          ),
          allowAsSubAgent: agent.allowAsSubAgent ?? DEFAULT_ALLOW_AS_SUB_AGENT,
          allowSubAgents: agent.allowSubAgents ?? DEFAULT_ALLOW_SUB_AGENTS,
          subAgentIds:
            agent.subAgentIds != null && agent.subAgentIds.length > 0
              ? [...agent.subAgentIds]
              : null,
          llmRoutingMode: agent.llmRoutingMode ?? 'unified',
          stageLlm: { ...(agent.stageLlm ?? {}) },
        })
      })

    pendingAgentConfigSaves.set(agentId, next)
    try {
      await next
    } finally {
      if (pendingAgentConfigSaves.get(agentId) === next) {
        pendingAgentConfigSaves.delete(agentId)
      }
    }
  }

  async function waitForPendingAgentConfigurationSave(
    agentId: string,
  ): Promise<void> {
    const pending = pendingAgentConfigSaves.get(agentId)
    if (!pending) return
    await pending.catch(() => {
      // Do not block message sending when settings persistence fails.
    })
  }

  async function deletePersistedAgentConfiguration(
    agentId: string,
  ): Promise<void> {
    const channel = window.ipcRendererChannel?.DeleteAgentConfiguration
    if (!channel?.invoke) return

    await channel.invoke({
      agentId,
      userId: DEFAULT_USER_ID,
    })
  }

  function waitForConversationRun(conversationId: string): Promise<void> {
    return new Promise((resolve) => {
      const waiters = inFlightWaiters.get(conversationId) ?? []
      waiters.push(resolve)
      inFlightWaiters.set(conversationId, waiters)
    })
  }

  function notifyNextConversationWaiter(conversationId: string): void {
    const waiters = inFlightWaiters.get(conversationId)
    if (!waiters || waiters.length === 0) return

    const next = waiters.shift()
    if (waiters.length === 0) inFlightWaiters.delete(conversationId)
    else inFlightWaiters.set(conversationId, waiters)

    next?.()
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async function initializeSettingsFromConfig() {
    if (hasLoadedSettings.value && agents.value.length > 0) return

    const values = await getSystemConfigValues([
      SYSTEM_PROP_KEYS.ollamaBaseURL,
      SYSTEM_PROP_KEYS.llamacppBaseURL,
      SYSTEM_PROP_KEYS.llamacppApiKey,
      SYSTEM_PROP_KEYS.anthropicApiKey,
      SYSTEM_PROP_KEYS.anthropicBaseURL,
      SYSTEM_PROP_KEYS.openaiApiKey,
      SYSTEM_PROP_KEYS.openaiBaseURL,
      SYSTEM_PROP_KEYS.geminiApiKey,
      SYSTEM_PROP_KEYS.geminiBaseURL,
      SYSTEM_PROP_KEYS.deepseekApiKey,
      SYSTEM_PROP_KEYS.deepseekApiUrl,
      SYSTEM_PROP_KEYS.zhipuApiKey,
      SYSTEM_PROP_KEYS.zhipuBaseURL,
      PROVIDER_SETUP_DISMISSED_KEY,
      ONBOARDING_COMPLETED_KEY,
      ...openAiCompatibleProviderConfigKeys(),
    ])

    ollamaBaseURL.value = normalizeBaseURL(
      values[SYSTEM_PROP_KEYS.ollamaBaseURL] ?? ollamaBaseURL.value,
      'http://localhost:11434',
    )
    llamacppBaseURL.value = normalizeLlamaCppBaseURL(
      values[SYSTEM_PROP_KEYS.llamacppBaseURL] ?? llamacppBaseURL.value,
    )
    llamacppApiKey.value = (
      values[SYSTEM_PROP_KEYS.llamacppApiKey] ?? ''
    ).trim()
    anthropicApiKey.value = (
      values[SYSTEM_PROP_KEYS.anthropicApiKey] ?? ''
    ).trim()
    anthropicBaseURL.value = normalizeBaseURL(
      values[SYSTEM_PROP_KEYS.anthropicBaseURL] ?? anthropicBaseURL.value,
      'https://api.anthropic.com/v1',
    )
    openaiApiKey.value = (values[SYSTEM_PROP_KEYS.openaiApiKey] ?? '').trim()
    openaiBaseURL.value = normalizeBaseURL(
      values[SYSTEM_PROP_KEYS.openaiBaseURL] ?? openaiBaseURL.value,
      'https://api.openai.com/v1',
    )
    geminiApiKey.value = (values[SYSTEM_PROP_KEYS.geminiApiKey] ?? '').trim()
    geminiBaseURL.value = normalizeBaseURL(
      values[SYSTEM_PROP_KEYS.geminiBaseURL] ?? geminiBaseURL.value,
      'https://generativelanguage.googleapis.com/v1beta',
    )
    deepseekApiKey.value = (
      values[SYSTEM_PROP_KEYS.deepseekApiKey] ?? ''
    ).trim()
    deepseekApiUrl.value = normalizeBaseURL(
      values[SYSTEM_PROP_KEYS.deepseekApiUrl] ?? deepseekApiUrl.value,
      'https://api.deepseek.com/v1',
    )
    zhipuApiKey.value = (values[SYSTEM_PROP_KEYS.zhipuApiKey] ?? '').trim()
    zhipuBaseURL.value = normalizeBaseURL(
      values[SYSTEM_PROP_KEYS.zhipuBaseURL] ?? zhipuBaseURL.value,
      'https://open.bigmodel.cn/api/paas/v4',
    )
    providerSetupDismissed.value =
      values[PROVIDER_SETUP_DISMISSED_KEY] === 'true' ||
      values[PROVIDER_SETUP_DISMISSED_KEY] === '1'
    onboardingCompleted.value =
      values[ONBOARDING_COMPLETED_KEY] === 'true' ||
      values[ONBOARDING_COMPLETED_KEY] === '1'

    if (!values[SYSTEM_PROP_KEYS.ollamaBaseURL]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.ollamaBaseURL,
        ollamaBaseURL.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.llamacppBaseURL]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.llamacppBaseURL,
        llamacppBaseURL.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.llamacppApiKey]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.llamacppApiKey,
        llamacppApiKey.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.anthropicApiKey]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.anthropicApiKey,
        anthropicApiKey.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.anthropicBaseURL]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.anthropicBaseURL,
        anthropicBaseURL.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.openaiApiKey]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.openaiApiKey,
        openaiApiKey.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.openaiBaseURL]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.openaiBaseURL,
        openaiBaseURL.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.geminiApiKey]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.geminiApiKey,
        geminiApiKey.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.geminiBaseURL]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.geminiBaseURL,
        geminiBaseURL.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.deepseekApiKey]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.deepseekApiKey,
        deepseekApiKey.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.deepseekApiUrl]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.deepseekApiUrl,
        deepseekApiUrl.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.zhipuApiKey]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.zhipuApiKey,
        zhipuApiKey.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.zhipuBaseURL]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.zhipuBaseURL,
        zhipuBaseURL.value,
      )
    }

    for (const id of OPENAI_COMPATIBLE_PROVIDER_IDS) {
      const meta = OPENAI_COMPATIBLE_LLM_PROVIDERS[id]
      openAiCompatibleApiKeys.value = {
        ...openAiCompatibleApiKeys.value,
        [id]: (values[meta.apiKeyConfigKey] ?? '').trim(),
      }
      openAiCompatibleBaseUrls.value = {
        ...openAiCompatibleBaseUrls.value,
        [id]: normalizeBaseURL(
          values[meta.baseUrlConfigKey] ?? openAiCompatibleBaseUrls.value[id],
          meta.defaultBaseUrl,
        ),
      }
      if (!values[meta.apiKeyConfigKey]) {
        void setSystemConfigValue(
          meta.apiKeyConfigKey,
          openAiCompatibleApiKeys.value[id],
        )
      }
      if (!values[meta.baseUrlConfigKey]) {
        void setSystemConfigValue(
          meta.baseUrlConfigKey,
          openAiCompatibleBaseUrls.value[id],
        )
      }
    }

    await loadSkillsFromDisk()
    await loadMcpServers()

    if (agents.value.length === 0) {
      log.warn('Agent list empty after LoadSkills; retrying once')
      await loadSkillsFromDisk()
    }

    if (agents.value.length === 0) {
      log.error('No chat agents available — check main process logs for LoadSkills errors')
    }

    // Select the default skill on first load (prefer non-workflow chat agents).
    if (!selectedAgentId.value) {
      const pickFrom = chatSelectableAgents.value
      const defaultAgent = pickFrom.find(
        (agent) => agent.enabled && agent.name === 'Default',
      )
      const fallbackAgent = pickFrom[0]
      const initialAgent = defaultAgent ?? fallbackAgent
      if (initialAgent) {
        await selectAgent(initialAgent.id)
      }
    } else if (
      selectedAgentId.value &&
      isWorkflowPanelAgentId(selectedAgentId.value)
    ) {
      const fallback =
        chatSelectableAgents.value.find((a) => a.name === 'Default') ??
        chatSelectableAgents.value[0]
      if (fallback) await selectAgent(fallback.id)
    }

    await loadAllConversationLists()
    if (!focusedConversationId.value) {
      const recent = mostRecentConversation()
      if (recent) {
        await selectConversation(recent.id)
      }
    }

    hasLoadedSettings.value = true
  }

  async function loadAllConversationLists(): Promise<void> {
    await Promise.all(
      agents.value.map((agent) =>
        conversationList.value[agent.id]
          ? Promise.resolve()
          : loadConversationList(agent.id),
      ),
    )
  }

  async function selectAgent(agentId: string) {
    const convId = focusedConversationId.value
    if (convId) {
      await assignAgentToConversation(convId, agentId)
      return
    }
    selectedAgentId.value = agentId
    if (!conversationList.value[agentId]) {
      await loadConversationList(agentId)
    }
  }

  async function fetchConversationMeta(
    conversationId: string,
  ): Promise<Conversation | undefined> {
    const channel = window.ipcRendererChannel?.GetConversationMeta
    if (!channel?.invoke) return undefined
    const row = await channel.invoke({ conversationId })
    if (!row) return undefined
    const meta: Conversation = {
      id: row.id,
      agentId: row.agentId,
      title: row.title,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      type: classifyConversationSessionId(row.id),
    }
    const list = conversationList.value[meta.agentId] ?? []
    if (!list.some((c) => c.id === conversationId)) {
      conversationList.value = {
        ...conversationList.value,
        [meta.agentId]: [meta, ...list],
      }
    }
    return meta
  }

  async function syncSelectedAgentFromConversation(
    conversationId: string,
  ): Promise<void> {
    let meta = findConversationMeta(conversationId)
    if (!meta) {
      meta = await fetchConversationMeta(conversationId)
    }
    if (!meta?.agentId) return

    if (selectedAgentId.value !== meta.agentId) {
      selectedAgentId.value = meta.agentId
    }
    if (!conversationList.value[meta.agentId]) {
      await loadConversationList(meta.agentId)
    }
    activeConversationId.value = {
      ...activeConversationId.value,
      [meta.agentId]: conversationId,
    }
  }

  async function assignAgentToConversation(
    conversationId: string,
    agentId: string,
  ): Promise<void> {
    const trimmedAgentId = agentId.trim()
    if (!trimmedAgentId) return

    const existing = findConversationMeta(conversationId)
    if (existing?.agentId === trimmedAgentId) {
      selectedAgentId.value = trimmedAgentId
      activeConversationId.value = {
        ...activeConversationId.value,
        [trimmedAgentId]: conversationId,
      }
      if (!conversationList.value[trimmedAgentId]) {
        await loadConversationList(trimmedAgentId)
      }
      return
    }

    const channel = window.ipcRendererChannel?.UpdateConversationAgent
    if (channel?.invoke) {
      await channel.invoke({
        conversationId,
        agentId: trimmedAgentId,
      })
    }

    selectedAgentId.value = trimmedAgentId

    if (existing && existing.agentId !== trimmedAgentId) {
      const oldAgentId = existing.agentId
      const list = conversationList.value[oldAgentId] ?? []
      const conv =
        list.find((c) => c.id === conversationId) ?? { ...existing }
      const updated: Conversation = {
        ...conv,
        agentId: trimmedAgentId,
        updatedAt: new Date(),
      }
      conversationList.value = {
        ...conversationList.value,
        [oldAgentId]: list.filter((c) => c.id !== conversationId),
        [trimmedAgentId]: [
          updated,
          ...(conversationList.value[trimmedAgentId] ?? []).filter(
            (c) => c.id !== conversationId,
          ),
        ],
      }
      if (activeConversationId.value[oldAgentId] === conversationId) {
        const nextActive = { ...activeConversationId.value }
        delete nextActive[oldAgentId]
        activeConversationId.value = nextActive
      }
    } else if (!existing) {
      await fetchConversationMeta(conversationId)
    }

    activeConversationId.value = {
      ...activeConversationId.value,
      [trimmedAgentId]: conversationId,
    }

    if (!conversationList.value[trimmedAgentId]) {
      await loadConversationList(trimmedAgentId)
    }
  }

  async function loadConversationList(agentId: string): Promise<void> {
    const channel = window.ipcRendererChannel?.ListConversations
    if (!channel?.invoke) {
      conversationList.value[agentId] = []
      return
    }
    const stored = await channel.invoke({ agentId })
    conversationList.value[agentId] = stored.map(
      (c: {
        id: string
        agentId: string
        title: string
        createdAt: string
        updatedAt: string
      }) => ({
        id: c.id,
        agentId: c.agentId,
        title: c.title,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
        type: classifyConversationSessionId(c.id),
      }),
    )
  }

  type IpcStoredMessage = {
    id: string
    role: 'user' | 'assistant'
    content: string
    createdAt: string
  }

  function mapIpcStoredMessage(m: IpcStoredMessage): Message {
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: new Date(m.createdAt),
    }
  }

  function mergeMessagesByIdChronological(
    existing: Message[],
    incoming: Message[],
  ): Message[] {
    const byId = new Map<string, Message>()
    for (const m of existing) byId.set(m.id, m)
    for (const m of incoming) byId.set(m.id, m)
    return [...byId.values()].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    )
  }

  /**
   * Fetches messages for `conversationId` from IPC and stores them in
   * `conversations`. Falls back to an empty array when IPC is unavailable.
   */
  async function loadConversationMessages(
    conversationId: string,
  ): Promise<void> {
    const pageChannel = window.ipcRendererChannel?.GetConversationMessagesPage
    if (pageChannel?.invoke) {
      const page = await pageChannel.invoke({ conversationId, limit: 40 })
      conversations.value[conversationId] = page.messages.map(mapIpcStoredMessage)
      conversationMessagePagination.value[conversationId] = {
        hasOlder: page.hasOlder,
      }
    } else {
      const channel = window.ipcRendererChannel?.GetConversation
      if (channel?.invoke) {
        const stored = await channel.invoke({ conversationId })
        conversations.value[conversationId] = stored.map(mapIpcStoredMessage)
      } else {
        conversations.value[conversationId] = []
      }
      conversationMessagePagination.value[conversationId] = { hasOlder: false }
    }

    const sandboxChannel = window.ipcRendererChannel?.GetConversationSandboxRuns
    if (sandboxChannel?.invoke) {
      try {
        const rows = await sandboxChannel.invoke({ conversationId })
        if (Array.isArray(rows)) {
          const tabs: ConversationSandboxRun[] = rows.map((r, i) => ({
            id: r.sandboxRoot,
            label: `Run ${i + 1}`,
            resultsFileUrl: r.resultsFileUrl,
            outputResultsDir: r.outputResultsDir,
            sandboxRoot: r.sandboxRoot,
          }))
          conversationSandboxRuns.value = {
            ...conversationSandboxRuns.value,
            [conversationId]: tabs,
          }
        }
      } catch (err) {
        log.warn('GetConversationSandboxRuns failed', {
          conversationId,
          err,
        })
      }
    }

    log.info('Loaded conversation messages', {
      conversationId,
      messageCount: conversations.value[conversationId]?.length ?? 0,
      hasOlder:
        conversationMessagePagination.value[conversationId]?.hasOlder ?? false,
      sandboxRunCount:
        conversationSandboxRuns.value[conversationId]?.length ?? 0,
    })
  }

  /** Merge the latest page from disk without dropping prepended older history. */
  async function refreshConversationMessagesTail(
    conversationId: string,
  ): Promise<void> {
    const pageChannel = window.ipcRendererChannel?.GetConversationMessagesPage
    if (!pageChannel?.invoke) {
      await loadConversationMessages(conversationId)
      return
    }

    const page = await pageChannel.invoke({ conversationId, limit: 40 })
    const incoming = page.messages.map(mapIpcStoredMessage)
    const existing = conversations.value[conversationId] ?? []

    if (incoming.length === 0) {
      if (existing.length === 0) {
        conversations.value[conversationId] = []
      }
      return
    }

    const oldestOnPage = incoming[0]!.createdAt.getTime()
    const olderPrefix = existing.filter(
      (m) => m.createdAt.getTime() < oldestOnPage,
    )
    const merged =
      olderPrefix.length > 0
        ? mergeMessagesByIdChronological(olderPrefix, incoming)
        : incoming

    conversations.value[conversationId] = merged
    conversationMessagePagination.value[conversationId] = {
      hasOlder:
        olderPrefix.length > 0 || page.hasOlder,
    }
  }

  async function loadOlderConversationMessages(
    conversationId: string,
  ): Promise<boolean> {
    const pagination = conversationMessagePagination.value[conversationId]
    if (pagination && !pagination.hasOlder) return false

    const list = conversations.value[conversationId] ?? []
    const oldest = list[0]
    if (!oldest) return false

    const pageChannel = window.ipcRendererChannel?.GetConversationMessagesPage
    if (!pageChannel?.invoke) return false

    const page = await pageChannel.invoke({
      conversationId,
      before: oldest.createdAt.toISOString(),
      limit: 40,
    })
    if (page.messages.length === 0) {
      conversationMessagePagination.value[conversationId] = { hasOlder: false }
      return false
    }

    const incoming = page.messages.map(mapIpcStoredMessage)
    conversations.value[conversationId] = mergeMessagesByIdChronological(
      list,
      incoming,
    )
    conversationMessagePagination.value[conversationId] = {
      hasOlder: page.hasOlder,
    }
    return true
  }

  function conversationHasOlderMessages(conversationId: string): boolean {
    return conversationMessagePagination.value[conversationId]?.hasOlder ?? false
  }

  /**
   * Builds the message history for a conversation, serializing assistant
   * messages for the model and excluding empty messages.
   * Pass `excludeId` to omit the current in-progress assistant placeholder.
   */
  function buildConversationHistory(
    conversationId: string,
    excludeId?: string,
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    return (conversations.value[conversationId] ?? [])
      .filter((m) => m.id !== excludeId && m.content)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content:
          m.role === 'assistant'
            ? serializeAssistantMessageForHistory(m.content)
            : m.content,
      }))
  }

  /**
   * Returns the message with `assistantId` in `conversationId`.
   * If the conversation array doesn't exist yet it is created.
   * If no message with that id is found, a new streaming assistant placeholder
   * is pushed and returned.
   */
  function getOrCreateAssistantMessage(
    conversationId: string,
    assistantId: string = randomShortUuid(),
    defaults?: Partial<Omit<Message, 'id' | 'role'>>,
  ): Message {
    if (!conversations.value[conversationId]) {
      conversations.value[conversationId] = []
    }
    const existing = conversations.value[conversationId].find(
      (m) => m.id === assistantId,
    )
    if (existing) return existing

    const created: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      isStreaming: true,
      ...defaults,
    }
    conversations.value[conversationId].push(created)
    return created
  }

  function removeAssistantMessageFromConversation(
    conversationId: string,
    messageId: string,
  ): void {
    const list = conversations.value[conversationId]
    if (!list) return
    const idx = list.findIndex((m) => m.id === messageId)
    if (idx >= 0) list.splice(idx, 1)
  }

  async function selectConversation(
    conversationId: string,
    forceReload = false,
  ): Promise<void> {
    focusedConversationId.value = conversationId
    await syncSelectedAgentFromConversation(conversationId)
    // Load messages if not cached
    if (forceReload || !conversations.value[conversationId]) {
      // Never replace an array that belongs to an in-flight stream — doing so
      // would wipe the assistant placeholder and cause getMsg() to return null.
      if (forceReload && isConversationStreamActive(conversationId)) {
        return
      }
      log.info('Loading conversation into renderer store', {
        conversationId,
        forceReload,
        hasActiveStream: isConversationStreamActive(conversationId),
      })

      await loadConversationMessages(conversationId)
    }
  }

  async function createNewConversation(
    title?: string,
  ): Promise<Conversation | null> {
    const agentId = selectedAgentId.value
    if (!agentId) return null
    const now = new Date()
    const conv: Conversation = {
      id: randomShortUuid(),
      agentId,
      title: title ?? 'New Conversation',
      createdAt: now,
      updatedAt: now,
      type: 'ui',
    }
    const channel = window.ipcRendererChannel?.CreateConversation
    if (channel?.invoke) {
      await channel.invoke({
        id: conv.id,
        agentId: conv.agentId,
        title: conv.title,
        createdAt: conv.createdAt.toISOString(),
      })
    }
    conversations.value[conv.id] = []
    conversationList.value[agentId] = [
      conv,
      ...(conversationList.value[agentId] ?? []),
    ]
    await useWorkspaceStore().commitPendingWorkspace(conv.id)
    focusedConversationId.value = conv.id
    activeConversationId.value[agentId] = conv.id
    return conv
  }

  async function renameConversation(
    conversationId: string,
    title: string,
  ): Promise<void> {
    const meta = findConversationMeta(conversationId)
    const agentId = meta?.agentId ?? selectedAgentId.value
    if (!agentId) return
    const channel = window.ipcRendererChannel?.UpdateConversationTitle
    if (channel?.invoke) await channel.invoke({ conversationId, title })
    const list = conversationList.value[agentId]
    if (list) {
      const conv = list.find((c) => c.id === conversationId)
      if (conv) {
        conv.title = title
        conv.updatedAt = new Date()
      }
    }
  }

  async function resolveAgentAndEnsureConversationLoaded(
    conversationId: string,
    agentId: string,
    forceReloadConversation = false,
  ): Promise<Agent | null> {
    const agent = agents.value.find((a) => a.id === agentId)
    log.info('Resolved agent for conversation run', {
      conversationId,
      agentId,
      found: !!agent,
      agentName: agent?.name,
    })

    if (!agent) {
      log.error('Agent not found for conversation run', {
        conversationId,
        agentId,
      })
      return null
    }

    if (forceReloadConversation || !conversations.value[conversationId]) {
      log.info('Loading conversation history before run', {
        conversationId,
        agentId,
        forceReloadConversation,
      })
      await loadConversationMessages(conversationId)
    }

    return agent
  }

  async function runAssistantForConversation(
    conversationId: string,
    agentId: string,
    options?: {
      forceReloadConversation?: boolean
      /** Channel/scheduler outbound: user-facing text only. */
      externalReply?: boolean
      pendingUserMessage?: {
        id: string
        content: string
        createdAt: string
      }
    },
  ): Promise<string | null> {
    log.info('Starting renderer-side assistant run', {
      conversationId,
      agentId,
    })

    // Prevent concurrent executions for the same conversation
    if (inFlightConversations.has(conversationId)) {
      log.info(
        'Assistant run skipped because conversation is already in flight',
        {
          conversationId,
        },
      )
      return null
    }
    inFlightConversations.add(conversationId)
    log.info('Conversation marked in flight', {
      conversationId,
      inFlightCount: inFlightConversations.size,
    })
    try {
      const agent = await resolveAgentAndEnsureConversationLoaded(
        conversationId,
        agentId,
        options?.forceReloadConversation ?? false,
      )
      if (!agent) {
        return null
      }

      await waitForPendingAgentConfigurationSave(agentId)

      const abortController = new AbortController()

      var assistantConversation = getOrCreateAssistantMessage(
        (conversationId = conversationId),
      )

      activeStreamState.value = {
        conversationId: conversationId,
        assistantId: assistantConversation.id,
        abortController: abortController,
      }

      const history = buildConversationHistory(
        conversationId,
        assistantConversation.id,
      )

      let stripAssistantPlaceholder = false

      try {
        const provider = agent.provider ?? 'ollama'

        // Wrap stream call in timeout protection
        const streamPromise = (async () => {
          try {
            log.info('Invoking RunAgentForConversation IPC', {
              conversationId,
              agentId,
              assistantMessageId: assistantConversation.id,
            })
            const runChannel =
              window.ipcRendererChannel?.RunAgentForConversation
            if (!runChannel?.invoke) {
              throw new Error('RunAgentForConversation IPC channel unavailable')
            }
            const result = await runChannel.invoke({
              conversationId,
              agentId,
              assistantMessageId: assistantConversation.id,
              userId: DEFAULT_USER_ID,
              ...(options?.pendingUserMessage
                ? { pendingUserMessage: options.pendingUserMessage }
                : {}),
            })
            return result
          } catch (innerErr) {
            log.error('RunAgentForConversation IPC failed', {
              conversationId,
              agentId,
              err: innerErr,
            })
            throw innerErr
          }
        })()

        const timeoutMs = 60000 * 30
        const ipcResult = await Promise.race([
          streamPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => {
              log.error('RunAgentForConversation timed out', {
                conversationId,
                agentId,
                timeoutMs,
              })
              reject(
                new Error(
                  `RunAgentForConversation timeout after ${timeoutMs}ms`,
                ),
              )
            }, timeoutMs),
          ),
        ])

        if (ipcResult.hasError) {
          stripAssistantPlaceholder = true
          log.error('Assistant run completed with error', {
            conversationId,
            agentId,
            assistantMessageId: assistantConversation.id,
            errorMessage: ipcResult.errorMessage?.trim() || 'Agent failed',
          })
        } else if (assistantConversation && ipcResult.finalContent.trim()) {
          assistantConversation.content =
            mergeStreamingTextIntoStructuredContent(
              ipcResult.finalContent,
              assistantConversation.content,
            )
        }

        if (provider === 'ollama' && !ipcResult.hasError)
          connectionStatus.value = 'connected'
        if (provider === 'ollama' && ipcResult.hasError)
          connectionStatus.value = 'error'
        log.info('Renderer-side assistant run completed', {
          conversationId,
          agentId,
          assistantMessageId: assistantConversation.id,
          hasError: ipcResult.hasError,
          finalContentLength: ipcResult.finalContent.length,
        })
      } catch (err: unknown) {
        log.error('Renderer-side assistant run failed', {
          conversationId,
          agentId,
          err,
        })
        if (isAbortError(err)) {
          if (assistantConversation) assistantConversation.isStreaming = false
          log.info('Renderer-side assistant run aborted', {
            conversationId,
            agentId,
            assistantMessageId: assistantConversation.id,
          })
          return null
        }
        stripAssistantPlaceholder = true
        if (agent.provider === 'ollama') connectionStatus.value = 'error'
      } finally {
        log.info('Cleaning up renderer-side assistant run state', {
          conversationId,
          agentId,
          assistantMessageId: assistantConversation.id,
        })

        if (assistantConversation) {
          if (stripAssistantPlaceholder) {
            removeAssistantMessageFromConversation(
              conversationId,
              assistantConversation.id,
            )
          }
          markAssistantMessageFinished(conversationId, assistantConversation.id)
          if (!stripAssistantPlaceholder) {
            const serialize = options?.externalReply
              ? serializeAssistantMessageForExternalReply
              : serializeAssistantMessageForHistory
            const serialized = serialize(assistantConversation.content).trim()
            log.info('Returning serialized assistant response to caller', {
              conversationId,
              agentId,
              assistantMessageId: assistantConversation.id,
              serializedLength: serialized.length,
            })
            return serialized
          }
        } else {
          log.error('Assistant placeholder missing during renderer cleanup', {
            conversationId,
            agentId,
          })
        }
      }

      log.info('Renderer-side assistant run returned no content', {
        conversationId,
        agentId,
      })
      return null
    } finally {
      inFlightConversations.delete(conversationId)
      notifyNextConversationWaiter(conversationId)
      log.info('Conversation removed from in-flight set', {
        conversationId,
        inFlightCount: inFlightConversations.size,
      })
    }
  }

  async function handleChannelIncomingToAgent(args: {
    channelId: string
    senderTarget: string
    conversationId: string
    agentId: string
  }): Promise<void> {
    log.info('Handling incoming channel message for agent', args)

    if (
      !args?.channelId ||
      !args?.agentId ||
      !args?.conversationId ||
      !args?.senderTarget
    ) {
      log.warn('Incoming channel message missing required args', args)
      return
    }

    let resolvedAgentId = args.agentId
    let agentExists = agents.value.some((a) => a.id === resolvedAgentId)
    log.info('Checking requested agent for incoming channel message', {
      requestedAgentId: args.agentId,
      exists: agentExists,
      availableAgents: agents.value.map((a) => a.id),
    })

    if (!agentExists) {
      log.info('Requested agent not found; reloading skills from disk')
      await loadSkillsFromDisk()
      agentExists = agents.value.some((a) => a.id === resolvedAgentId)
      log.info('Agent check after reloading skills', {
        exists: agentExists,
        availableAgents: agents.value.map((a) => a.id),
      })
    }

    if (!agentExists && selectedAgentId.value) {
      log.info('Falling back to selected agent for incoming channel message', {
        fallbackAgentId: selectedAgentId.value,
      })
      resolvedAgentId = selectedAgentId.value
      agentExists = agents.value.some((a) => a.id === resolvedAgentId)
    }

    if (!agentExists) {
      const fallback = agents.value.find((a) => a.enabled) ?? agents.value[0]
      if (!fallback) {
        log.error('No agent available to handle incoming channel message')
        return
      }
      log.info('Using enabled fallback agent for incoming channel message', {
        fallbackAgentId: fallback.id,
      })
      resolvedAgentId = fallback.id
    }

    log.info('Resolved agent for incoming channel message', {
      resolvedAgentId,
      conversationId: args.conversationId,
    })

    // Mark channel-originated conversation (type inferred from id on reload).
    channelConversationIds.value = new Set([
      ...channelConversationIds.value,
      args.conversationId,
    ])

    const replyText = await runAssistantForConversation(
      args.conversationId,
      resolvedAgentId,
      { forceReloadConversation: true, externalReply: true },
    )
    log.info('Incoming channel message produced agent reply', {
      conversationId: args.conversationId,
      resolvedAgentId,
      replyLength: replyText?.length ?? 0,
    })

    if (!replyText) {
      log.warn('No reply text returned for incoming channel message', {
        conversationId: args.conversationId,
        resolvedAgentId,
      })
      return
    }

    const sendChannel = window.ipcRendererChannel?.SendChannelMessage
    log.info('Checking SendChannelMessage availability', {
      available: !!sendChannel?.invoke,
    })

    if (!sendChannel?.invoke) {
      log.error('SendChannelMessage invoke not available')
      return
    }

    log.info('Sending agent reply back to channel', {
      channelId: args.channelId,
      conversationId: args.conversationId,
    })
    try {
      await sendChannel.invoke({
        channelId: args.channelId,
        target: args.senderTarget,
        text: replyText,
      })
      log.info('Successfully sent reply to channel', {
        channelId: args.channelId,
        conversationId: args.conversationId,
      })
    } catch (error) {
      log.error('Failed to send reply to channel', {
        channelId: args.channelId,
        conversationId: args.conversationId,
        err: error,
      })
    }
  }

  async function sendMessage(content: string) {
    const agentId = selectedAgentId.value
    if (!agentId || !content.trim()) return

    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return

    // Ensure there's an active conversation; create one if needed
    let convId = currentConversationId.value
    if (!convId) {
      const trimmed = content.trim()
      const autoTitle =
        trimmed.length > 60 ? trimmed.slice(0, 57) + '…' : trimmed
      const conv = await createNewConversation(autoTitle)
      if (!conv) return
      convId = conv.id
    }

    if (!conversations.value[convId]) conversations.value[convId] = []

    // Apply folder picked before this conversation existed (composer folder icon).
    await useWorkspaceStore().commitPendingWorkspace(convId)

    // Auto-title from first user message if conversation still has default title
    const convMeta = findConversationMeta(convId)
    if (
      convMeta &&
      convMeta.title === 'New Conversation' &&
      conversations.value[convId].length === 0
    ) {
      const trimmed = content.trim()
      const autoTitle =
        trimmed.length > 60 ? trimmed.slice(0, 57) + '…' : trimmed
      void renameConversation(convId, autoTitle)
    }

    const userMsg: Message = {
      id: randomShortUuid(),
      role: 'user',
      content: content.trim(),
      createdAt: new Date(),
    }
    conversations.value[convId].push(userMsg)

    log.info('Sending user message to agent', {
      agentId,
      conversationId: convId,
      contentLength: userMsg.content.length,
    })

    await runAssistantForConversation(convId, agentId, {
      pendingUserMessage: {
        id: userMsg.id,
        content: userMsg.content,
        createdAt: userMsg.createdAt.toISOString(),
      },
    })
  }

  async function checkConnection() {
    try {
      const res = await fetch(`${ollamaBaseURL.value}/api/version`, {
        signal: AbortSignal.timeout(60000 * 5),
      })
      connectionStatus.value = res.ok ? 'connected' : 'error'
    } catch {
      connectionStatus.value = 'error'
    }
  }

  async function checkLlamaCppConnection() {
    try {
      const headers: Record<string, string> = {}
      if (llamacppApiKey.value) {
        headers.Authorization = `Bearer ${llamacppApiKey.value}`
      }
      const res = await fetch(`${llamacppBaseURL.value}/models`, {
        headers,
        signal: AbortSignal.timeout(5000),
      })
      llamacppConnectionStatus.value = res.ok ? 'connected' : 'error'
    } catch {
      llamacppConnectionStatus.value = 'error'
    }
  }

  function buildLlmCredentialsSnapshot(): LlmProviderCredentialsSnapshot {
    const compatible = {} as LlmProviderCredentialsSnapshot['openAiCompatible']
    for (const id of OPENAI_COMPATIBLE_PROVIDER_IDS) {
      compatible[id] = { apiKey: openAiCompatibleApiKeys.value[id] ?? '' }
    }
    return {
      ollamaReachable: connectionStatus.value === 'connected',
      llamacppReachable: llamacppConnectionStatus.value === 'connected',
      openaiApiKey: openaiApiKey.value,
      anthropicApiKey: anthropicApiKey.value,
      geminiApiKey: geminiApiKey.value,
      deepseekApiKey: deepseekApiKey.value,
      zhipuApiKey: zhipuApiKey.value,
      openAiCompatible: compatible,
    }
  }

  const hasLlmProviderReady = computed(() =>
    hasAnyLlmProviderConfigured(buildLlmCredentialsSnapshot()),
  )

  const configuredLlmProviderIds = computed(() =>
    (LLM_PROVIDER_IDS as readonly ProviderType[]).filter((id) =>
      isLlmProviderConfigured(id, buildLlmCredentialsSnapshot()),
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
      buildLlmCredentialsSnapshot(),
    ),
  )

  const shouldShowProviderSetupWizard = computed(
    () =>
      onboardingCompleted.value &&
      !providerSetupDismissed.value &&
      !hasLlmProviderReady.value,
  )

  const shouldRequireFirstTimeRampUp = computed(() => !onboardingCompleted.value)

  async function dismissProviderSetupWizard(): Promise<void> {
    providerSetupDismissed.value = true
    await setSystemConfigValue(PROVIDER_SETUP_DISMISSED_KEY, 'true')
  }

  async function completeOnboarding(): Promise<void> {
    onboardingCompleted.value = true
    providerSetupDismissed.value = true
    await setSystemConfigValue(ONBOARDING_COMPLETED_KEY, 'true')
    await setSystemConfigValue(PROVIDER_SETUP_DISMISSED_KEY, 'true')
    markOnboardingCompleteInRouteCache()
  }

  function applyLlmDefaultsToAllAgents(
    provider: ProviderType,
    model: string,
  ): void {
    const normalizedModel = model.trim()
    if (!normalizedModel) return
    for (const agent of agents.value) {
      updateAgentProvider(agent.id, provider)
      updateAgentModel(agent.id, normalizedModel)
    }
  }

  async function testProviderConnection(
    provider: ProviderType,
  ): Promise<ProviderConnectionTestResult> {
    try {
      if (provider === 'ollama') {
        await checkConnection()
        if (connectionStatus.value !== 'connected') {
          return { ok: false, error: 'Cannot reach Ollama server' }
        }
        await fetchModelsForProvider('ollama')
        const modelCount = availableModelsByProvider.value.ollama?.length ?? 0
        return { ok: true, modelCount }
      }

      if (provider === 'llamacpp') {
        await checkLlamaCppConnection()
        if (llamacppConnectionStatus.value !== 'connected') {
          return { ok: false, error: 'Cannot reach llama.cpp server' }
        }
        await fetchModelsForProvider('llamacpp')
        const modelCount = availableModelsByProvider.value.llamacpp?.length ?? 0
        return { ok: true, modelCount }
      }

      if (provider === 'openai') {
        const key = openaiApiKey.value.trim()
        if (!key) return { ok: false, error: 'API key is required' }
        const res = await fetch(`${openaiBaseURL.value}/models`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) {
          return { ok: false, error: `OpenAI API returned ${res.status}` }
        }
        await fetchModelsForProvider('openai')
        const modelCount = availableModelsByProvider.value.openai?.length ?? 0
        return { ok: true, modelCount }
      }

      if (provider === 'gemini') {
        const key = geminiApiKey.value.trim()
        if (!key) return { ok: false, error: 'API key is required' }
        const res = await fetch(
          `${geminiBaseURL.value}/models?key=${encodeURIComponent(key)}`,
          { signal: AbortSignal.timeout(8000) },
        )
        if (!res.ok) {
          return { ok: false, error: `Gemini API returned ${res.status}` }
        }
        await fetchModelsForProvider('gemini')
        const modelCount = availableModelsByProvider.value.gemini?.length ?? 0
        return { ok: true, modelCount }
      }

      if (provider === 'anthropic') {
        const key = anthropicApiKey.value.trim()
        if (key.length < 8) return { ok: false, error: 'API key is required' }
        updateAnthropicApiKey(key)
        await fetchModelsForProvider('anthropic')
        const modelCount = availableModelsByProvider.value.anthropic?.length ?? 0
        return { ok: true, modelCount }
      }

      if (provider === 'deepseek') {
        const key = deepseekApiKey.value.trim()
        if (key.length < 8) return { ok: false, error: 'API key is required' }
        const res = await fetch(`${deepseekApiUrl.value}/models`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) {
          updateDeepSeekApiKey(key)
          await fetchModelsForProvider('deepseek')
          const modelCount = availableModelsByProvider.value.deepseek?.length ?? 0
          return modelCount > 0
            ? { ok: true, modelCount }
            : { ok: false, error: `DeepSeek API returned ${res.status}` }
        }
        await fetchModelsForProvider('deepseek')
        const modelCount = availableModelsByProvider.value.deepseek?.length ?? 0
        return { ok: true, modelCount }
      }

      if (provider === 'zhipu') {
        const key = zhipuApiKey.value.trim()
        if (key.length < 8) return { ok: false, error: 'API key is required' }
        updateZhipuApiKey(key)
        await fetchModelsForProvider('zhipu')
        const modelCount = availableModelsByProvider.value.zhipu?.length ?? 0
        return { ok: true, modelCount }
      }

      if (isOpenAiCompatibleProvider(provider)) {
        const key = openAiCompatibleApiKeys.value[provider]?.trim() ?? ''
        if (!key) return { ok: false, error: 'API key is required' }
        const baseUrl = openAiCompatibleBaseUrls.value[provider]
        const res = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) {
          return { ok: false, error: `${provider} API returned ${res.status}` }
        }
        await fetchModelsForProvider(provider)
        const modelCount =
          availableModelsByProvider.value[provider]?.length ?? 0
        return { ok: true, modelCount }
      }

      return { ok: false, error: 'Unknown provider' }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Connection failed',
      }
    }
  }

  async function fetchModelsForProvider(provider: ProviderType) {
    try {
      if (provider === 'ollama') {
        const res = await fetch(`${ollamaBaseURL.value}/api/tags`, {
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return
        const data = await res.json()
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          ollama: (data.models ?? []).map((m: { name: string }) => m.name),
        }
      } else if (provider === 'llamacpp') {
        const headers: Record<string, string> = {}
        if (llamacppApiKey.value) {
          headers.Authorization = `Bearer ${llamacppApiKey.value}`
        }
        const res = await fetch(`${llamacppBaseURL.value}/models`, {
          headers,
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return
        const data = await res.json()
        const ids: string[] = (data.data ?? [])
          .map((m: { id: string }) => m.id)
          .filter(Boolean)
          .sort()
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          llamacpp: ids,
        }
      } else if (provider === 'openai' && openaiApiKey.value) {
        const res = await fetch(`${openaiBaseURL.value}/models`, {
          headers: { Authorization: `Bearer ${openaiApiKey.value}` },
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return
        const data = await res.json()
        const ids: string[] = (data.data ?? [])
          .map((m: { id: string }) => m.id)
          .filter((id: string) => /^(gpt-|o1|o3)/.test(id))
          .sort()
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          openai: ids,
        }
      } else if (provider === 'anthropic') {
        // Hardcoded — no public list API
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          anthropic: [...ANTHROPIC_MODELS],
        }
      } else if (provider === 'deepseek') {
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          deepseek: [...DEEPSEEK_MODELS],
        }
      } else if (provider === 'zhipu') {
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          zhipu: [...ZHIPU_MODELS],
        }
      } else if (provider === 'gemini' && geminiApiKey.value) {
        const res = await fetch(
          `${geminiBaseURL.value}/models?key=${geminiApiKey.value}`,
          { signal: AbortSignal.timeout(5000) },
        )
        if (!res.ok) return
        const data = await res.json()
        const names: string[] = (data.models ?? [])
          .filter((m: { supportedGenerationMethods?: string[] }) =>
            m.supportedGenerationMethods?.includes('generateContent'),
          )
          .map((m: { name: string }) => m.name.replace(/^models\//, ''))
          .sort()
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          gemini: names,
        }
      } else if (isOpenAiCompatibleProvider(provider)) {
        const meta = OPENAI_COMPATIBLE_LLM_PROVIDERS[provider]
        const apiKey = openAiCompatibleApiKeys.value[provider]
        const baseUrl = openAiCompatibleBaseUrls.value[provider]
        const fallback = [...meta.defaultModels]
        if (!apiKey) {
          availableModelsByProvider.value = {
            ...availableModelsByProvider.value,
            [provider]: fallback,
          }
          return
        }
        const res = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) {
          availableModelsByProvider.value = {
            ...availableModelsByProvider.value,
            [provider]: fallback,
          }
          return
        }
        const data = await res.json()
        const ids: string[] = (data.data ?? [])
          .map((m: { id: string }) => m.id)
          .filter(Boolean)
          .sort()
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          [provider]: ids.length > 0 ? ids : fallback,
        }
      }
    } catch (error) {
      // silently fail
      log.warn('Failed to fetch models for provider', { provider, err: error })
    }
  }

  // Keep the old fetchModels for backward compat (fetches Ollama)
  async function fetchModels() {
    await fetchModelsForProvider('ollama')
  }

  async function fetchMcpServerTools(
    serverId: string,
  ): Promise<McpToolDefinition[]> {
    const channel = window.ipcRendererChannel?.GetMcpServerTools
    if (!channel?.invoke) return []
    const tools = (await channel.invoke({
      userId: DEFAULT_USER_ID,
      serverId,
    })) as McpToolDefinition[]
    return Array.isArray(tools) ? tools : []
  }

  async function loadMcpServers(): Promise<void> {
    const channel = window.ipcRendererChannel?.ListMcpServers
    if (!channel?.invoke) {
      mcpServers.value = []
      mcpToolsByServer.value = {}
      return
    }

    const servers = (await channel.invoke({
      userId: DEFAULT_USER_ID,
    })) as McpServerDefinition[]

    mcpServers.value = Array.isArray(servers) ? servers : []

    const nextToolsMap: Record<string, McpToolDefinition[]> = {}
    for (const server of mcpServers.value) {
      if (!server.enabled) continue
      try {
        nextToolsMap[server.id] = await fetchMcpServerTools(server.id)
      } catch {
        nextToolsMap[server.id] = []
      }
    }

    mcpToolsByServer.value = nextToolsMap
  }

  async function addMcpServer(input: {
    name: string
    transportType: McpTransportType
    url?: string
    command?: string
    args?: string[]
    env?: Record<string, string>
    headers?: Record<string, string>
    enabled?: boolean
  }): Promise<void> {
    const channel = window.ipcRendererChannel?.CreateMcpServer
    if (!channel?.invoke) return

    await channel.invoke({
      id: randomShortUuid(),
      userId: DEFAULT_USER_ID,
      name: input.name,
      transportType: input.transportType,
      url: input.url ?? '',
      command: input.command ?? '',
      args: input.args ?? [],
      env: input.env ?? {},
      headers: input.headers ?? {},
      enabled: input.enabled ?? true,
    })

    await loadMcpServers()
  }

  async function toggleMcpServerEnabled(serverId: string): Promise<void> {
    const target = mcpServers.value.find((server) => server.id === serverId)
    if (!target) return

    const enabled = !target.enabled
    const channel = window.ipcRendererChannel?.SetMcpServerEnabled
    if (!channel?.invoke) return

    await channel.invoke({
      userId: DEFAULT_USER_ID,
      serverId,
      enabled,
    })

    target.enabled = enabled

    if (enabled) {
      try {
        mcpToolsByServer.value[serverId] = await fetchMcpServerTools(serverId)
      } catch {
        mcpToolsByServer.value[serverId] = []
      }
      return
    }

    delete mcpToolsByServer.value[serverId]
  }

  async function deleteMcpServer(serverId: string): Promise<void> {
    const channel = window.ipcRendererChannel?.DeleteMcpServer
    if (!channel?.invoke) return

    await channel.invoke({
      userId: DEFAULT_USER_ID,
      serverId,
    })

    mcpServers.value = mcpServers.value.filter(
      (server) => server.id !== serverId,
    )
    delete mcpToolsByServer.value[serverId]
  }

  // ── Config updaters ───────────────────────────────────────────────────────

  function updateOllamaURL(url: string) {
    ollamaBaseURL.value = normalizeBaseURL(url, 'http://localhost:11434')
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.ollamaBaseURL,
      ollamaBaseURL.value,
    )
    connectionStatus.value = 'unknown'
  }

  function updateLlamaCppURL(url: string) {
    llamacppBaseURL.value = normalizeLlamaCppBaseURL(url)
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.llamacppBaseURL,
      llamacppBaseURL.value,
    )
    llamacppConnectionStatus.value = 'unknown'
  }

  function updateLlamaCppApiKey(key: string) {
    llamacppApiKey.value = key.trim()
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.llamacppApiKey,
      llamacppApiKey.value,
    )
    llamacppConnectionStatus.value = 'unknown'
  }

  function updateAnthropicApiKey(key: string) {
    anthropicApiKey.value = key.trim()
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.anthropicApiKey,
      anthropicApiKey.value,
    )
  }

  function updateAnthropicBaseURL(url: string) {
    anthropicBaseURL.value = normalizeBaseURL(
      url,
      'https://api.anthropic.com/v1',
    )
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.anthropicBaseURL,
      anthropicBaseURL.value,
    )
  }

  function updateOpenAIApiKey(key: string) {
    openaiApiKey.value = key.trim()
    void setSystemConfigValue(SYSTEM_PROP_KEYS.openaiApiKey, openaiApiKey.value)
  }

  function updateOpenAIBaseURL(url: string) {
    openaiBaseURL.value = normalizeBaseURL(url, 'https://api.openai.com/v1')
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.openaiBaseURL,
      openaiBaseURL.value,
    )
  }

  function updateGeminiApiKey(key: string) {
    geminiApiKey.value = key.trim()
    void setSystemConfigValue(SYSTEM_PROP_KEYS.geminiApiKey, geminiApiKey.value)
  }

  function updateGeminiBaseURL(url: string) {
    geminiBaseURL.value = normalizeBaseURL(
      url,
      'https://generativelanguage.googleapis.com/v1beta',
    )
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.geminiBaseURL,
      geminiBaseURL.value,
    )
  }

  function updateDeepSeekApiKey(key: string) {
    deepseekApiKey.value = key.trim()
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.deepseekApiKey,
      deepseekApiKey.value,
    )
  }

  function updateDeepSeekApiUrl(url: string) {
    deepseekApiUrl.value = normalizeBaseURL(url, 'https://api.deepseek.com/v1')
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.deepseekApiUrl,
      deepseekApiUrl.value,
    )
  }

  function updateZhipuApiKey(key: string) {
    zhipuApiKey.value = key.trim()
    void setSystemConfigValue(SYSTEM_PROP_KEYS.zhipuApiKey, zhipuApiKey.value)
  }

  function updateZhipuBaseURL(url: string) {
    zhipuBaseURL.value = normalizeBaseURL(
      url,
      'https://open.bigmodel.cn/api/paas/v4',
    )
    void setSystemConfigValue(SYSTEM_PROP_KEYS.zhipuBaseURL, zhipuBaseURL.value)
  }

  function getOpenAiCompatibleApiKey(
    provider: OpenAiCompatibleProviderId,
  ): string {
    return openAiCompatibleApiKeys.value[provider]
  }

  function getOpenAiCompatibleBaseUrl(
    provider: OpenAiCompatibleProviderId,
  ): string {
    return openAiCompatibleBaseUrls.value[provider]
  }

  function updateOpenAiCompatibleApiKey(
    provider: OpenAiCompatibleProviderId,
    key: string,
  ) {
    const meta = OPENAI_COMPATIBLE_LLM_PROVIDERS[provider]
    openAiCompatibleApiKeys.value = {
      ...openAiCompatibleApiKeys.value,
      [provider]: key.trim(),
    }
    void setSystemConfigValue(
      meta.apiKeyConfigKey,
      openAiCompatibleApiKeys.value[provider],
    )
  }

  function updateOpenAiCompatibleBaseUrl(
    provider: OpenAiCompatibleProviderId,
    url: string,
  ) {
    const meta = OPENAI_COMPATIBLE_LLM_PROVIDERS[provider]
    const normalized = normalizeBaseURL(url, meta.defaultBaseUrl)
    openAiCompatibleBaseUrls.value = {
      ...openAiCompatibleBaseUrls.value,
      [provider]: normalized,
    }
    void setSystemConfigValue(meta.baseUrlConfigKey, normalized)
  }

  // ── Agent CRUD ────────────────────────────────────────────────────────────

  function updateAgentModel(agentId: string, model: string) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (agent) {
      agent.model = model
      void persistAgentConfiguration(agentId)
    }
  }

  function updateAgentName(agentId: string, name: string) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.name = name
    void persistAgentConfiguration(agentId)
  }

  function updateAgentDescription(agentId: string, description: string) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.description = description
    void persistAgentConfiguration(agentId)
  }

  function updateAgentColor(agentId: string, color: AgentColor) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.color = color
    void persistAgentConfiguration(agentId)
  }

  function updateAgentSkillsPrompt(agentId: string, prompt: string) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.skillsPrompt = prompt
    syncAgentExecutionSteps(agent)
    void persistAgentConfiguration(agentId)
  }

  function updateAgentAvailableSet(agentId: string, availableSet: string[]) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.availableSet = withMandatoryToolsInCatalog(
      agent.availableSkillTools ?? [],
      [...new Set(availableSet)],
    )
    agent.availableSetTouched = true
    syncAgentExecutionSteps(agent)
    void persistAgentConfiguration(agentId)
  }

  function updateAgentAvailableSetTouched(
    agentId: string,
    availableSetTouched: boolean,
  ) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.availableSetTouched = availableSetTouched
    if (!availableSetTouched) {
      agent.availableSet = reconcileAvailableSetWithCatalog(
        agent.availableSkillTools ?? [],
        { availableSetTouched: false },
      )
    }
    syncAgentExecutionSteps(agent)
    void persistAgentConfiguration(agentId)
  }

  function updateAgentToolNeedsApprovalOverrides(
    agentId: string,
    overrides: Record<string, boolean>,
  ) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.toolNeedsApprovalOverrides = { ...overrides }
    void persistAgentConfiguration(agentId)
  }

  function updateAgentAvailableMcpServers(
    agentId: string,
    serverIds: string[] | null,
  ) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.availableMcpServers =
      serverIds != null ? [...new Set(serverIds)] : undefined
    void persistAgentConfiguration(agentId)
  }

  function updateAgentToolLoopMaxIterations(
    agentId: string,
    maxIterations: number,
  ) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.toolLoopMaxIterations = clampToolLoopMaxIterations(maxIterations)
    syncAgentExecutionSteps(agent)
    applySubAgentSettingsToExecutionSteps(agent)
    void persistAgentConfiguration(agentId)
  }

  function updateAgentTodoMaxRetries(agentId: string, maxRetries: number) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.todoMaxRetries = clampTodoMaxRetries(maxRetries)
    void persistAgentConfiguration(agentId)
  }

  function updateAgentAllowAsSubAgent(agentId: string, allow: boolean) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.allowAsSubAgent = allow
    void persistAgentConfiguration(agentId)
  }

  function updateAgentSubAgentDelegation(
    agentId: string,
    allowSubAgents: boolean,
    subAgentIds: string[] | null,
  ) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.allowSubAgents = allowSubAgents
    agent.subAgentIds =
      subAgentIds != null && subAgentIds.length > 0
        ? [...new Set(subAgentIds)]
        : null
    syncAgentExecutionSteps(agent)
    applySubAgentSettingsToExecutionSteps(agent)
    void persistAgentConfiguration(agentId)
  }

  function updateAgentProvider(agentId: string, provider: ProviderType) {
    agents.value = agents.value.map((a) => {
      if (a.id !== agentId) return a
      return { ...a, provider, model: '' }
    })
    void persistAgentConfiguration(agentId)
  }

  function updateAgentLlmRoutingMode(
    agentId: string,
    llmRoutingMode: 'unified' | 'per_stage',
  ) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.llmRoutingMode = llmRoutingMode
    void persistAgentConfiguration(agentId)
  }

  function updateAgentStageLlm(
    agentId: string,
    stageLlm: Agent['stageLlm'],
  ) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.stageLlm = { ...(stageLlm ?? {}) }
    void persistAgentConfiguration(agentId)
  }

  function addAgent(data: Omit<Agent, 'id'>) {
    const created: Agent = {
      id: `custom:${randomShortUuid()}`,
      name: data.name.trim(),
      description: data.description,
      model: data.model,
      systemPrompt: data.systemPrompt,
      responseLanguage: data.responseLanguage,
      color: data.color,
      enabled: data.enabled,
      provider: data.provider,
      isSkill: false,
      skillsPrompt: data.skillsPrompt ?? '',
      availableSkillTools: data.availableSkillTools,
      availableSet: data.availableSet,
      availableSetTouched: data.availableSetTouched,
      toolNeedsApprovalOverrides: data.toolNeedsApprovalOverrides ?? {},
      availableMcpServers: data.availableMcpServers,
      toolLoopMaxIterations: clampToolLoopMaxIterations(
        data.toolLoopMaxIterations ?? DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
      ),
      todoMaxRetries: clampTodoMaxRetries(
        data.todoMaxRetries ?? DEFAULT_TODO_MAX_RETRIES,
      ),
      allowAsSubAgent: data.allowAsSubAgent ?? DEFAULT_ALLOW_AS_SUB_AGENT,
      allowSubAgents: data.allowSubAgents ?? DEFAULT_ALLOW_SUB_AGENTS,
      subAgentIds: data.subAgentIds ?? null,
      llmRoutingMode: data.llmRoutingMode ?? 'unified',
      stageLlm: { ...(data.stageLlm ?? {}) },
      executionSteps: data.executionSteps,
    }

    syncAgentExecutionSteps(created)
    applySubAgentSettingsToExecutionSteps(created)
    agents.value = [created, ...agents.value]
    void persistAgentConfiguration(created.id)
  }

  function removeAgent(agentId: string) {
    const target = agents.value.find((a) => a.id === agentId)
    if (!target) return

    agents.value = agents.value.filter((a) => a.id !== agentId || a.isSkill)
    if (selectedAgentId.value === agentId) selectedAgentId.value = null

    if (!target.isSkill) {
      void deletePersistedAgentConfiguration(agentId)
    }
  }

  function toggleAgentEnabled(agentId: string) {
    const target = agents.value.find((a) => a.id === agentId)
    if (!target) return
    const willBeEnabled = !target.enabled
    agents.value = agents.value.map((a) =>
      a.id === agentId ? { ...a, enabled: willBeEnabled } : a,
    )
    if (!willBeEnabled && selectedAgentId.value === agentId)
      selectedAgentId.value = null
    void persistAgentConfiguration(agentId)
  }

  async function deleteConversation(conversationId: string): Promise<void> {
    if (isBoundSessionId(conversationId)) {
      log.warn('Refusing to delete bound channel/scheduler session', {
        conversationId,
      })
      return
    }
    const delChannel = window.ipcRendererChannel?.DeleteConversation
    if (delChannel?.invoke) {
      try {
        await delChannel.invoke({ conversationId })
      } catch (err) {
        log.warn('DeleteConversation failed', { conversationId, err })
        return
      }
    }

    const nextSandbox = { ...conversationSandboxRuns.value }
    delete nextSandbox[conversationId]
    conversationSandboxRuns.value = nextSandbox

    const nextSel = { ...sandboxSelectedRunIdByConversation.value }
    delete nextSel[conversationId]
    sandboxSelectedRunIdByConversation.value = nextSel

    const meta = findConversationMeta(conversationId)
    const ownerAgentId = meta?.agentId
    delete conversations.value[conversationId]
    if (ownerAgentId) {
      conversationList.value[ownerAgentId] = (
        conversationList.value[ownerAgentId] ?? []
      ).filter((c) => c.id !== conversationId)
      if (activeConversationId.value[ownerAgentId] === conversationId) {
        delete activeConversationId.value[ownerAgentId]
      }
    }
    if (focusedConversationId.value === conversationId) {
      const recent = mostRecentConversation()
      if (recent && recent.id !== conversationId) {
        await selectConversation(recent.id)
      } else {
        focusedConversationId.value = null
      }
    }
  }

  async function clearConversationHistory(conversationId: string): Promise<void> {
    const channel = window.ipcRendererChannel?.ClearConversationHistory
    if (channel?.invoke) {
      try {
        await channel.invoke({ conversationId })
      } catch (err) {
        log.warn('ClearConversationHistory failed', { conversationId, err })
        return
      }
    }

    conversations.value[conversationId] = []
    conversationMessagePagination.value = {
      ...conversationMessagePagination.value,
      [conversationId]: { hasOlder: false },
    }
    conversationSandboxRuns.value = {
      ...conversationSandboxRuns.value,
      [conversationId]: [],
    }
    const nextSel = { ...sandboxSelectedRunIdByConversation.value }
    delete nextSel[conversationId]
    sandboxSelectedRunIdByConversation.value = nextSel
  }

  /**
   * Load skills from disk via IPC and replace the in-memory agent list.
   * Agent configuration is fully sourced from the skills folder.
   * @returns true when at least one agent was loaded
   */
  async function loadSkillsFromDisk(): Promise<boolean> {
    const channel = window.ipcRendererChannel?.LoadSkills
    if (!channel?.invoke) return false

    type SkillAgentPayload = {
      id: string
      name: string
      description: string
      model: string
      systemPrompt: string
      color: string
      enabled: boolean
      provider: string
      isSkill: true
      skillId: string
      allowedTools?: string[]
      actionToolNames?: string[]
      compiledArtifact?: {
        thinking?: { instructions?: string }
        instructions?: { instructions?: string }
        validation?: { rules?: string[] }
      }
      compilationStatus?: 'pending' | 'ready' | 'failed' | 'missing'
      skillsPrompt?: string
      toolLoop?: {
        tools: Array<{
          name: string
          tags?: string[]
          description: string
          inputSchema?: unknown
          os?: SkillTool['os']
          needsApproval?: boolean
        }>
        maxIterations?: number
      }
    } & Omit<Agent, 'executionSteps'> & {
        executionSteps?: AgentExecutionSteps
      }

    try {
      const skillAgents = (await channel.invoke()) as SkillAgentPayload[]
      if (!Array.isArray(skillAgents)) return false

      const configChannel = window.ipcRendererChannel?.ListAgentConfigurations
      const storedConfigs = configChannel?.invoke
        ? ((await configChannel.invoke({
            userId: DEFAULT_USER_ID,
          })) as PersistedAgentConfiguration[])
        : []
      const configByAgentId = new Map(
        storedConfigs.map((config) => [config.agentId, config]),
      )
      const previousByAgentId = new Map(
        agents.value.map((agent) => [agent.id, agent]),
      )

      const skillAgentIds = new Set(skillAgents.map((agent) => agent.id))

      const mergedSkillAgents = skillAgents.map((s) => {
        const saved = configByAgentId.get(s.id)
        const previous = previousByAgentId.get(s.id)
        const availableSkillTools =
          (s.executionSteps?.toolLoop?.tools as
            | AgentSkillToolMeta[]
            | undefined) ??
          (s.toolLoop?.tools as AgentSkillToolMeta[] | undefined) ??
          []
        const savedAvailableSetTouched = !!(
          saved?.availableSetTouched ?? previous?.availableSetTouched
        )
        let { availableSet, availableSetTouched } = resolveSkillAvailableSet(
          availableSkillTools,
          {
            skillAllowedTools: s.allowedTools,
            skillActionToolNames: s.actionToolNames,
            savedAvailableSet: saved?.availableSet ?? previous?.availableSet,
            availableSetTouched: savedAvailableSetTouched,
          },
        )
        if (s.skillId && !savedAvailableSetTouched) {
          availableSet = expandSkillWorkspaceAvailableSet(
            s.skillId,
            availableSkillTools,
            availableSet,
          )
        }
        if (!savedAvailableSetTouched) {
          availableSet = expandSkillSubAgentAvailableSet(
            availableSkillTools,
            availableSet,
          )
        }
        const toolNeedsApprovalOverrides = expandRunScriptApprovalOverrides(
          mergeSkillSubAgentApprovalOverrides(
            availableSkillTools,
            availableSet,
            mergeSkillWorkspaceApprovalOverrides(
              s.skillId,
              availableSkillTools,
              availableSet,
              saved?.toolNeedsApprovalOverrides ??
                previous?.toolNeedsApprovalOverrides,
            ),
          ),
        )

        const resolved = resolveSkillAgentConfiguration(
          s,
          saved,
          s.compiledArtifact,
        )

        const merged: Agent = {
          id: s.id,
          name: saved?.name ?? s.name,
          description: saved?.description ?? s.description,
          model: saved?.model ?? s.model,
          systemPrompt: resolved.systemPrompt,
          responseLanguage: s.responseLanguage,
          color: (saved?.color ?? s.color) as Agent['color'],
          enabled: saved?.enabled ?? s.enabled,
          provider: (saved?.provider ?? s.provider) as ProviderType,
          isSkill: true as const,
          skillId: s.skillId,
          skillsPrompt: resolved.skillsPrompt,
          availableSkillTools,
          availableSet,
          availableSetTouched,
          availableMcpServers:
            saved?.availableMcpServers ??
            previous?.availableMcpServers ??
            undefined,
          toolNeedsApprovalOverrides,
          toolLoopMaxIterations:
            saved?.toolLoopMaxIterations ??
            previous?.toolLoopMaxIterations ??
            s.executionSteps?.toolLoop?.maxIterations ??
            DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
          todoMaxRetries:
            saved?.todoMaxRetries ??
            previous?.todoMaxRetries ??
            DEFAULT_TODO_MAX_RETRIES,
          allowAsSubAgent: resolveAllowAsSubAgent(
            saved?.allowAsSubAgent ?? previous?.allowAsSubAgent,
          ),
          allowSubAgents: resolveAllowSubAgents(
            saved?.allowSubAgents ?? previous?.allowSubAgents,
          ),
          subAgentIds:
            saved?.subAgentIds ??
            previous?.subAgentIds ??
            null,
          llmRoutingMode: saved?.llmRoutingMode ?? previous?.llmRoutingMode ?? 'unified',
          stageLlm: {
            ...(saved?.stageLlm ?? previous?.stageLlm ?? {}),
          },
          executionSteps: s.executionSteps,
          compiledArtifact: s.compiledArtifact,
          compilationStatus: s.compilationStatus,
        }

        syncAgentExecutionSteps(merged)
        applySubAgentSettingsToExecutionSteps(merged)
        return merged
      })

      const customAgents: Agent[] = storedConfigs
        .filter(
          (config) =>
            !skillAgentIds.has(config.agentId) &&
            !config.agentId.startsWith('skill:'),
        )
        .map((config) => {
          const custom: Agent = {
            id: config.agentId,
            name: config.name,
            description: config.description,
            model: config.model,
            systemPrompt: config.systemPrompt,
            color: config.color,
            enabled: config.enabled,
            provider: config.provider,
            isSkill: false,
            skillsPrompt: config.skillsPrompt,
            availableSkillTools: [],
            availableSet: [...(config.availableSet ?? [])],
            availableSetTouched: !!config.availableSetTouched,
            toolNeedsApprovalOverrides: config.toolNeedsApprovalOverrides ?? {},
            availableMcpServers: config.availableMcpServers ?? undefined,
            toolLoopMaxIterations: config.toolLoopMaxIterations,
            todoMaxRetries: config.todoMaxRetries,
            allowAsSubAgent: resolveAllowAsSubAgent(config.allowAsSubAgent),
            allowSubAgents: resolveAllowSubAgents(config.allowSubAgents),
            subAgentIds: config.subAgentIds ?? null,
            llmRoutingMode: config.llmRoutingMode ?? 'unified',
            stageLlm: { ...(config.stageLlm ?? {}) },
          }
          syncAgentExecutionSteps(custom)
          applySubAgentSettingsToExecutionSteps(custom)
          return custom
        })

      agents.value = [...customAgents, ...mergedSkillAgents]

      if (
        selectedAgentId.value &&
        !agents.value.some((agent) => agent.id === selectedAgentId.value)
      ) {
        selectedAgentId.value = null
      }

      for (const agent of mergedSkillAgents) {
        const skillPayload = skillAgents.find((s) => s.id === agent.id)
        const saved = configByAgentId.get(agent.id)
        if (skillPayload && skillAgentPromptsNeedSeed(saved, skillPayload)) {
          await persistAgentConfiguration(agent.id)
        }
      }
      return agents.value.length > 0
    } catch (err) {
      // IPC unavailable (browser/test) or LoadSkills failed (e.g. skill load error)
      log.warn('loadSkillsFromDisk failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }

  return {
    hasLoadedSettings,
    providerSetupDismissed,
    onboardingCompleted,
    hasLlmProviderReady,
    configuredLlmProviderIds,
    areAllAgentsLlmReady,
    shouldShowProviderSetupWizard,
    shouldRequireFirstTimeRampUp,
    dismissProviderSetupWizard,
    completeOnboarding,
    applyLlmDefaultsToAllAgents,
    testProviderConnection,
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
    enabledMcpTools,
    selectAgent,
    initializeSettingsFromConfig,
    loadSkillsFromDisk,
    loadMcpServers,
    sendMessage,
    handleChannelIncomingToAgent,
    checkConnection,
    checkLlamaCppConnection,
    fetchModels,
    fetchModelsForProvider,
    updateOllamaURL,
    updateLlamaCppURL,
    updateLlamaCppApiKey,
    updateAnthropicApiKey,
    updateAnthropicBaseURL,
    updateOpenAIApiKey,
    updateOpenAIBaseURL,
    updateGeminiApiKey,
    updateGeminiBaseURL,
    updateDeepSeekApiKey,
    updateDeepSeekApiUrl,
    updateZhipuApiKey,
    updateZhipuBaseURL,
    getOpenAiCompatibleApiKey,
    getOpenAiCompatibleBaseUrl,
    updateOpenAiCompatibleApiKey,
    updateOpenAiCompatibleBaseUrl,
    addMcpServer,
    toggleMcpServerEnabled,
    deleteMcpServer,
    fetchMcpServerTools,
    updateAgentModel,
    updateAgentName,
    updateAgentDescription,
    updateAgentColor,
    updateAgentSkillsPrompt,
    updateAgentAvailableSet,
    updateAgentAvailableSetTouched,
    updateAgentToolNeedsApprovalOverrides,
    updateAgentAvailableMcpServers,
    updateAgentToolLoopMaxIterations,
    updateAgentTodoMaxRetries,
    updateAgentAllowAsSubAgent,
    updateAgentSubAgentDelegation,
    updateAgentProvider,
    updateAgentLlmRoutingMode,
    updateAgentStageLlm,
    addAgent,
    removeAgent,
    toggleAgentEnabled,
    conversationList,
    activeConversationId,
    focusedConversationId,
    currentConversationId,
    currentConversationType,
    uiConversationList,
    channelConversationList,
    channelConversationIds,
    loadConversationList,
    loadConversationMessages,
    refreshConversationMessagesTail,
    loadOlderConversationMessages,
    conversationHasOlderMessages,
    selectConversation,
    createNewConversation,
    loadAllConversationLists,
    renameConversation,
    deleteConversation,
    clearConversationHistory,
    conversationSandboxRuns,
    sandboxRunsForCurrentConversation,
    selectedSandboxRunIdForCurrentConversation,
    recordSandboxOutput,
    setSelectedSandboxRunId,
    markAssistantMessageFinished,
    markUiChatInFlight,
    isConversationStreamActive,
    stopStreaming,
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
