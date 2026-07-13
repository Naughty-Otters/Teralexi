import type { CodingMode } from '@shared/agent/coding-mode'
import type { ConversationHooksConfig } from '@shared/agent/conversation-hooks'
import type { AgentPlanModeState } from '@shared/agent/plan-mode'
import type { ProviderType } from '@shared/agent/llm-provider-registry'
import type {
  AgentLlmChoice,
  AgentLlmRoutingMode,
  AgentLlmStage,
} from '@shared/agent/stage-llm-settings'

export interface StoredConversation {
  id: string
  agentId: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface StoredConversationSettings {
  conversationId: string
  workspacePath: string | null
  /** Tool names approved for the rest of this conversation (session-scoped HITL). */
  sessionApprovedTools: string[]
  /** Kimi-like coding interaction mode for this conversation. */
  codingMode: CodingMode
  /** Kimi-style agent-driven explore mode state. */
  planModeState: AgentPlanModeState
  /** Per-conversation pre/post turn shell hooks. */
  hooks: ConversationHooksConfig
  updatedAt: string
}

export interface StoredMessage {
  id: string
  conversationId: string
  agentId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  /** Semantic thread label (e.g. 'auth', 'database', 'testing'). Defaults to 'general'. */
  threadTag?: string
}

export interface StoredMessageAttachment {
  id: string
  messageId: string
  conversationId: string
  originalName: string
  mimeType: string | null
  sizeBytes: number
  sandboxPath: string
  createdAt: string
}

export interface StoredUserProperty {
  userId: string
  propertyKey: string
  propertyValue: string
  updatedAt: string
}

/** One agent run's sandbox directory (persists across app restarts). */
export interface StoredConversationSandboxRun {
  sandboxRoot: string
  conversationId: string
  resultsFileUrl: string
  outputResultsDir: string
  createdAt: string
}

export type StoredMcpTransportType = 'http' | 'sse' | 'stdio'

export interface StoredMcpServer {
  id: string
  userId: string
  name: string
  transportType: StoredMcpTransportType
  url: string
  command: string
  args: string[]
  env: Record<string, string>
  headers: Record<string, string>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type StoredSkillCompilationSource = 'bundled' | 'user'
export type StoredSkillCompilationStatus = 'pending' | 'ready' | 'failed'

export interface StoredSkillCompilation {
  skillId: string
  source: StoredSkillCompilationSource
  sourceFingerprint: string
  status: StoredSkillCompilationStatus
  /** Parsed artifact when status is ready and JSON is valid */
  compiled: import('@main/skills/skill-compiled-schema').SkillCompiledArtifact | null
  errorMessage: string | null
  compiledAt: string | null
  updatedAt: string
}

export interface StoredAgentConfiguration {
  agentId: string
  userId: string
  name: string
  description: string
  model: string
  provider: ProviderType
  color:
    | 'primary'
    | 'secondary'
    | 'success'
    | 'info'
    | 'warning'
    | 'error'
    | 'neutral'
  enabled: boolean
  systemPrompt: string
  skillsPrompt: string
  availableSet: string[]
  availableSetTouched: boolean
  toolNeedsApprovalOverrides: Record<string, boolean>
  availableMcpServers: string[] | null
  toolLoopMaxIterations: number
  todoMaxRetries: number
  allowAsSubAgent: boolean
  allowSubAgents: boolean
  subAgentIds: string[] | null
  llmRoutingMode: AgentLlmRoutingMode
  stageLlm: Partial<Record<AgentLlmStage, AgentLlmChoice>>
  createdAt: string
  updatedAt: string
}

export type StoredSchedulerType = 'interval' | 'cron'
export type StoredSchedulerActionType =
  | 'send-channel-message'
  | 'run-agent'
  | 'run-workflow'

export interface StoredSchedulerDefinition {
  id: string
  userId: string
  name: string
  enabled: boolean
  scheduleType: StoredSchedulerType
  intervalMs: number | null
  cronExpression: string | null
  timezone: string | null
  actionType: StoredSchedulerActionType
  channelId: string
  target: string
  message: string
  agentId: string
  conversationId: string
  prompt: string
  workflowId: string
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
}

export interface StoredTokenUsageRecord {
  id: string
  userId: string
  recordedAt: string
  conversationId: string | null
  agentId: string | null
  assistantMessageId: string | null
  stepId: string | null
  source: string
  provider: string | null
  model: string | null
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface TokenUsageChartPoint {
  recordedAt: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface TokenUsageChartSeries {
  seriesKey: string
  provider: string | null
  model: string | null
  label: string
  points: TokenUsageChartPoint[]
}

export interface TokenUsageOverview {
  sessions: number
  messages: number
  totalTokens: number
  activeDays: number
}

export interface TokenUsageModelSummary {
  seriesKey: string
  provider: string | null
  model: string | null
  label: string
  totalTokens: number
}

export interface TokenUsageDailySegment {
  seriesKey: string
  totalTokens: number
}

export interface TokenUsageDailyBar {
  date: string
  segments: TokenUsageDailySegment[]
  totalTokens: number
}

export interface TokenUsageDashboard {
  overview: TokenUsageOverview
  models: TokenUsageModelSummary[]
  dailyBars: TokenUsageDailyBar[]
}

/** One tool call + result pair recorded per tool-loop execution. */
export interface StoredToolResult {
  id: string
  conversationId: string
  agentId: string
  stepId: string
  toolName: string
  inputSummary: string
  outputText: string
  outputSummary: string
  outputChars: number
  isError: boolean
  createdAt: string
  threadTag?: string
}

export interface MessageSearchHit extends StoredMessage {
  rank: number
}

export interface ToolResultSearchHit extends StoredToolResult {
  rank: number
}

export type StoredWorkflowStatus =
  | 'draft'
  | 'confirmed'
  | 'testing'
  | 'deployed'

export interface StoredWorkflow {
  id: string
  userId: string
  name: string
  description: string
  status: StoredWorkflowStatus
  currentVersionId: string | null
  createdAt: string
  updatedAt: string
}

export interface StoredWorkflowVersion {
  id: string
  workflowId: string
  versionNumber: number
  definitionJson: string
  mermaid: string
  summaryMarkdown: string
  compilerMetadataJson: string
  createdAt: string
}

export type StoredWorkflowDeploymentTarget = 'local' | 'agent-server'

export interface StoredWorkflowDeployment {
  id: string
  workflowId: string
  versionId: string
  userId: string
  target: StoredWorkflowDeploymentTarget
  enabled: boolean
  configJson: string
  lastRunAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export interface StoredWorkflowTrigger {
  id: string
  workflowId: string
  deploymentId: string | null
  triggerType: string
  configJson: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}
