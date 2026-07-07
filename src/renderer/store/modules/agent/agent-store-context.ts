import type { Ref, ComputedRef, WritableComputedRef } from 'vue'
import type { ChatBoxDisplayMode } from '@renderer/views/agent-chat/chatBoxDisplayMode'
import type { OpenAiCompatibleProviderId } from '@shared/agent/llm-provider-registry'
import type { createLogger } from '@renderer/utils/logger'
import type {
  Agent,
  Conversation,
  ConversationSandboxRun,
  McpServerDefinition,
  McpToolDefinition,
  Message,
  ProviderType,
  RuntimeToolMeta,
} from './types'

export type AgentStoreContext = {
  log: ReturnType<typeof createLogger>

  inFlightConversations: Set<string>
  uiChatInFlightConversations: Set<string>
  inFlightWaiters: Map<string, Array<() => void>>
  pendingAgentConfigSaves: Map<string, Promise<void>>

  agents: Ref<Agent[]>
  conversations: Ref<Record<string, Message[]>>
  conversationMessagePagination: Ref<Record<string, { hasOlder: boolean }>>
  conversationList: Ref<Record<string, Conversation[]>>
  activeConversationId: Ref<Record<string, string>>
  focusedConversationId: Ref<string | null>
  channelConversationIds: Ref<Set<string>>
  selectedAgentId: Ref<string | null>
  activeStreamState: Ref<{
    conversationId: string
    assistantId: string
    abortController: AbortController
  } | null>
  hasLoadedSettings: Ref<boolean>
  isLoadingInitialConversations: Ref<boolean>
  hasLoadedInitialConversations: Ref<boolean>
  providerSetupDismissed: Ref<boolean>
  onboardingCompleted: Ref<boolean>
  mcpServers: Ref<McpServerDefinition[]>
  mcpToolsByServer: Ref<Record<string, McpToolDefinition[]>>
  mcpToolsLoadErrorByServer: Ref<Record<string, string>>
  conversationSandboxRuns: Ref<Record<string, ConversationSandboxRun[]>>
  sandboxSelectedRunIdByConversation: Ref<Record<string, string>>
  chatBoxDisplayMode: Ref<ChatBoxDisplayMode>

  ollamaBaseURL: Ref<string>
  connectionStatus: Ref<'unknown' | 'connected' | 'error'>
  llamacppBaseURL: Ref<string>
  llamacppApiKey: Ref<string>
  llamacppConnectionStatus: Ref<'unknown' | 'connected' | 'error'>
  anthropicApiKey: Ref<string>
  anthropicBaseURL: Ref<string>
  openaiApiKey: Ref<string>
  openaiBaseURL: Ref<string>
  geminiApiKey: Ref<string>
  geminiBaseURL: Ref<string>
  deepseekApiKey: Ref<string>
  deepseekApiUrl: Ref<string>
  zhipuApiKey: Ref<string>
  zhipuBaseURL: Ref<string>
  openAiCompatibleApiKeys: Ref<Record<OpenAiCompatibleProviderId, string>>
  openAiCompatibleBaseUrls: Ref<Record<OpenAiCompatibleProviderId, string>>
  availableModelsByProvider: Ref<Record<ProviderType, string[]>>

  selectedAgent: ComputedRef<Agent | null>
  enabledAgents: ComputedRef<Agent[]>
  chatSelectableAgents: ComputedRef<Agent[]>
  currentConversationId: ComputedRef<string | null>
  currentMessages: ComputedRef<Message[]>
  isStreaming: ComputedRef<boolean>
  currentConversationType: ComputedRef<Conversation['type']>
  sandboxRunsForCurrentConversation: ComputedRef<ConversationSandboxRun[]>
  selectedSandboxRunIdForCurrentConversation: ComputedRef<string | null>
  enabledMcpTools: ComputedRef<RuntimeToolMeta[]>
  hasLlmProviderReady: ComputedRef<boolean>
  configuredLlmProviderIds: ComputedRef<ProviderType[]>
  areAllAgentsLlmReady: ComputedRef<boolean>
  shouldShowProviderSetupWizard: ComputedRef<boolean>
  shouldRequireFirstTimeRampUp: ComputedRef<boolean>
  assistantStructuredDebugEnabled: WritableComputedRef<boolean>
}
