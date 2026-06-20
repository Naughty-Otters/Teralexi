import type { ExecutionSteps, SkillTool } from '@main/skills/types'
import type { StepAttachment } from '@shared/agent/step-attachment'
import type { ProviderType } from '@shared/agent/llm-provider-registry'
import type {
  AgentLlmChoice,
  AgentLlmRoutingMode,
  AgentLlmStage,
} from '@shared/agent/stage-llm-settings'

export type { ProviderType }

/**
 * Configuration for multi-step agentic execution.
 * Main-process order when planning is enabled: thinking → planning → execution → summary/report.
 * Coding skill skips pipeline planning (thinking → tool loop). If a step is not specified, it is skipped.
 */
export type AgentExecutionSteps = ExecutionSteps<
  Omit<SkillTool, 'execute' | 'inputSchema'> & { inputSchema?: unknown }
>

export type AgentSkillToolMeta = Omit<SkillTool, 'execute' | 'inputSchema'> & {
  inputSchema?: unknown
}

export interface Agent {
  id: string
  name: string
  description: string
  model: string
  systemPrompt: string
  responseLanguage?: string
  color:
    | 'primary'
    | 'secondary'
    | 'success'
    | 'info'
    | 'warning'
    | 'error'
    | 'neutral'
  enabled: boolean
  provider: ProviderType
  /** Set to true for agents loaded from a skill folder */
  isSkill?: boolean
  /** Folder name of the originating skill (only when isSkill is true) */
  skillId?: string
  /** Multi-step execution configuration */
  executionSteps?: AgentExecutionSteps
  /** Editable instructions (skill.md) prompt */
  skillsPrompt?: string
  /** Full skill tool catalog available for this agent (if skill-backed). */
  availableSkillTools?: AgentSkillToolMeta[]
  /** Enabled skill tool names from AvailableSet (empty array means none). */
  availableSet?: string[]
  /** Whether AvailableSet has been explicitly customized by the user. */
  availableSetTouched?: boolean
  /** Per-tool override for whether the tool requires approval before execution. */
  toolNeedsApprovalOverrides?: Record<string, boolean>
  /** MCP server IDs that are enabled for this agent (undefined = all enabled servers). */
  availableMcpServers?: string[]
  /** Max tool-loop steps per execution (default 40). */
  toolLoopMaxIterations?: number
  /** Max full todo re-attempts when fallback_plan is retry (default 3). */
  todoMaxRetries?: number
  /** Other agents may delegate to this agent. */
  allowAsSubAgent?: boolean
  /** Tool loop may use gated `invoke_agent` ( `invoke_skill` is always available when tool loop runs). */
  allowSubAgents?: boolean
  /** Allow-list for `invoke_agent`; null/empty = any eligible sub-agent. */
  subAgentIds?: string[] | null
  /** Structured compile output when loaded from disk/DB. */
  compiledArtifact?: {
    thinking?: { instructions?: string }
    instructions?: { instructions?: string }
    validation?: { rules?: string[] }
  }
  compilationStatus?: 'pending' | 'ready' | 'failed' | 'missing'
  llmRoutingMode?: AgentLlmRoutingMode
  stageLlm?: Partial<Record<AgentLlmStage, AgentLlmChoice>>
}

export type McpTransportType = 'http' | 'sse' | 'stdio'

export interface McpServerDefinition {
  id: string
  userId: string
  name: string
  transportType: McpTransportType
  url: string
  command: string
  args: string[]
  env: Record<string, string>
  headers: Record<string, string>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema?: unknown
}

export type RuntimeToolMeta =
  | (AgentSkillToolMeta & {
      inputSchema?: unknown
      source?: 'skill'
    })
  | {
      name: string
      description: string
      inputSchema?: unknown
      os?: SkillTool['os']
      needsApproval?: boolean
      source: 'mcp'
      serverId: string
      toolName: string
    }

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
  isStreaming?: boolean
}

export interface ProviderCredentials {
  ollamaBaseURL: string
  llamacppBaseURL: string
  llamacppApiKey: string
  anthropicApiKey: string
  anthropicBaseURL: string
  openaiApiKey: string
  openaiBaseURL: string
  geminiApiKey: string
  geminiBaseURL: string
  deepseekApiKey: string
  deepseekApiUrl: string
  zhipuApiKey: string
  zhipuBaseURL: string
}

export type AgentMessage = { role: 'user' | 'assistant'; content: string }

export type AgentResponseOpts = {
  provider: ProviderType
  model: string
  systemPrompt: string
  responseLanguage?: string
  abortSignal?: AbortSignal
  messages: AgentMessage[]
  onChunk: (chunk: string) => void
  executionSteps?: AgentExecutionSteps
  toolLoopMaxIterations?: number
  skillId?: string
  mcpTools?: RuntimeToolMeta[]
  availableSet?: string[]
  availableSetTouched?: boolean
} & ProviderCredentials

export type ValidationResult = {
  valid: boolean
  messages: string[]
}

export interface PlanningResult {
  finalGoal: string
  todoList: TodoItem[]
  expectations: string[]
  questions: string[]
  raw?: string
}

export interface TodoItem {
  id: number
  description: string
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  output?: string
}

export interface StepOutputs {
  planning?: PlanningResult
  skills?: string
  toolLoop?: string
  summary?: SummaryResult
  report?: string
}

export type SummaryResult = {
  summary: string
  goalAchieved: boolean
  waysToAchieveGoalBetter: string
  shouldMemorize: boolean
  memorizeReason: string
}

export type AssistantSubStepType =
  | 'ThinkingStep'
  | 'PlanningStep'
  | 'SkillsToolExecutionStep'
  | 'SummaryStep'
  | 'AnalysisStep'
  | 'ReportStep'
  | 'CreatePaperStep'
  | 'SearchStep'
  | 'WebScrapeStep'

export interface AssistantSubStep {
  type: AssistantSubStepType
  title: string
  content: string
}

export interface StepRunCapture {
  stepType: AssistantSubStepType
  title: string
  content: string
  outputPaths: string[]
  attachments?: StepAttachment[]
  /** @deprecated Legacy field — converted to attachments on load. */
  outputLinks?: Array<{ label: string; url: string }>
}

export interface ResultSnapshotRef {
  pdfPath: string
  pdfUrl: string
}

export interface ResearchReportRef {
  pdfPath: string
  pdfUrl: string
  topic: string
  sourceCount: number
  paperExcerpt?: string
}

export interface PipelineConversationTurn {
  sectionId: string
  stepId: string
  title: string
  content: string
  status: 'completed'
  attachments?: StepAttachment[]
  /** @deprecated Legacy field — converted to attachments on load. */
  outputLinks?: Array<{ label: string; url: string }>
  stepKey?: string
  sequence?: number
}

export interface AssistantStructuredContent {
  version: 2
  assistantContent: {
    outer: {
      streamingText?: string
      finalResult: string
      report: string
      stepCaptures?: StepRunCapture[]
      allArtifactPaths?: string[]
      resultSnapshot?: ResultSnapshotRef
      researchReport?: ResearchReportRef
      pipelineConversation?: PipelineConversationTurn[]
    }
    subSteps: AssistantSubStep[]
  }
}

export interface Conversation {
  id: string
  agentId: string
  title: string
  createdAt: Date
  updatedAt: Date
  type: 'ui' | 'channel' | 'scheduler'
}

/** One agent run’s sandbox preview metadata (keyed per conversation by `sandboxRoot`). */
export interface ConversationSandboxRun {
  id: string
  label: string
  resultsFileUrl: string
  outputResultsDir: string
  sandboxRoot: string
}
