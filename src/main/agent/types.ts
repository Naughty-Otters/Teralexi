import type { ExecutionSteps, SkillTool } from '@main/skills/types'
import type { StepAttachment } from '@shared/agent/step-attachment'
import type { ProviderType } from '@shared/agent/llm-provider-registry'
import type { OpenAiCompatibleProviderId } from '@shared/agent/llm-provider-registry'
import type { AgentEventBus } from './bus/agent-event-bus'
import type { ClientUiMessage } from './utils/client-ui-parse'
import type { AgentStageLlmSettings } from '@shared/agent/stage-llm-settings'

export type { ProviderType }

export type AgentExecutionSteps = ExecutionSteps<
  Omit<SkillTool, 'execute' | 'inputSchema'> & { inputSchema?: unknown }
>

export type AgentSkillToolMeta = Omit<SkillTool, 'execute' | 'inputSchema'> & {
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
  xaiApiKey: string
  xaiBaseURL: string
  zhipuApiKey: string
  zhipuBaseURL: string
  openAiCompatible: Record<
    OpenAiCompatibleProviderId,
    { apiKey: string; baseURL: string }
  >
}

export type AgentMessage = { role: 'user' | 'assistant'; content: string }

import type { SandboxReadyPayload } from './sandbox'

export type AgentSandboxReadyPayload = SandboxReadyPayload

export type {
  SandboxLayout,
  SandboxAccess,
  SandboxPlanningAccess,
} from './sandbox'

export type AgentResponseOpts = {
  provider: ProviderType
  model: string
  /** Per-stage LLM routing; built from agent config at run start. */
  stageLlm?: AgentStageLlmSettings
  systemPrompt: string
  responseLanguage?: string
  abortSignal?: AbortSignal
  messages: AgentMessage[]
  /**
   * Per-run workspace override (isolated git worktree). When set, tools bind
   * here instead of the conversation's shared workspace path.
   */
  workspacePathOverride?: string
  onChunk: (chunk: string) => void
  /** Raw AI SDK UI chunks (tool approvals, text-delta, etc.) for renderer Chat transport */
  onUIMessageChunk?: (chunk: Record<string, unknown>) => void
  /** Live per-step progress for the renderer; final structured content is still persisted separately. */
  onStepProgress?: (payload: AgentStepProgressPayload) => void
  /** Sub-agent run lifecycle for parallel delegation UI. */
  onSubAgentRunEvent?: (event: SubAgentRunLifecycleEvent) => void
  /**
   * When resuming after HITL (tool approval or form submit), full Chat history from the renderer.
   * Parsed via {@link parseClientUiMessages} and converted with {@link buildAgentModelMessages}.
   */
  clientUiMessages?: ClientUiMessage[] | undefined
  /** Trailing user row when UI history ends with an assistant placeholder. */
  pendingUserMessage?: {
    id: string
    content: string
    createdAt: string
  }
  executionSteps?: AgentExecutionSteps
  /** Max tool-loop steps; falls back to executionSteps.toolLoop.maxIterations or 40. */
  toolLoopMaxIterations?: number
  /** Max full todo re-attempts when fallback_plan is retry (default 3). */
  todoMaxRetries?: number
  skillId?: string
  /** Declared config.properties fields from the skill's properties.md. */
  systemProperties?: import('@shared/skills/skill-system-properties').SkillSystemPropertySpec[]
  /** Structured skill compile output when available (planning canonical todos, etc.). */
  compiledArtifact?: import('@main/skills/skill-compiled-schema').SkillCompiledArtifact
  /** Configured agent id for this run (distinct from skill catalog id). */
  agentId?: string
  mcpTools?: RuntimeToolMeta[]
  availableSet?: string[]
  availableSetTouched?: boolean
  /** Agent-level overrides for tool `needsApproval` (tool name → require approval). */
  toolNeedsApprovalOverrides?: Record<string, boolean>
  userId: string
  /** When set, sandbox previews and UI can scope to the active conversation */
  conversationId?: string
  /** Fires once per run after the sandbox directory is ready */
  onSandboxReady?: (payload: AgentSandboxReadyPayload) => void
  /** User-uploaded files for the current turn (copied under input/uploads/). */
  userAttachments?: import('@shared/chat/attachments').ChatAttachmentMeta[]
  /** After the run finishes, when `result-snapshot.pdf` is written under output/results */
  onSandboxResultWritten?: (payload: AgentSandboxReadyPayload) => void
  /** Same assistant row id as renderer Chat / IPC stream (used for pending execution resume). */
  assistantMessageId?: string
  /** In-process event bus for LLM domain events (optional; wired at conversation entry). */
  eventBus?: AgentEventBus
  /** Per-turn folder name under `<sandbox>/llm-debug/` when LLM debug logging is enabled. */
  llmDebugRunId?: string
} & ProviderCredentials

export type ValidationResult = {
  valid: boolean
  messages: string[]
}

import {
  ReferenceResource,
  ReferenceDoc,
  ReferenceScript,
} from './resources/reference-resource'

export { ReferenceResource, ReferenceDoc, ReferenceScript }
export type {
  ReferenceLoadContext,
  ReferenceLoadResult,
} from './resources/reference-resource'

/** How downstream stages run after thinking. */
export type ThinkingExecutionMode =
  | 'planning'
  | 'agent_call'
  | 'direct_answer'
  | 'research'
  | 'skill_chain'

/** Output of the Thinking step (runs before planning when planning is enabled). */
export interface ThinkingResult {
  raw: string
  execution_mode?: ThinkingExecutionMode
  goal?: string
  task?: string
  context?: string[]
  rationale?: string
  /** User-facing answer when execution_mode is direct_answer. */
  response?: string
}

/** One agent task in a multi-skill chain. */
export interface SkillChainTask {
  agentId: string
  task: string
}

/** Ordered plan produced by the skill-chain-planning step. */
export interface SkillChainPlan {
  tasks: SkillChainTask[]
}

export interface PlanningResult {
  finalGoal: string
  todoList: TodoItem[]
  /**
   * Run-level success checks derived from skill.md (and reference docs when needed).
   * The summary step uses these to decide {@link SummaryResult.goalAchieved}.
   */
  expectations: string[]
  raw?: string
}

export interface TodoItem {
  id: number
  name: string
  description: string
  success_criteria: string
  fallback_plan: 'retry' | 'skip' | 'manual_intervention'
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  output?: string
  /** Shell command run in workspace after tool loop; non-zero exit fails the step. */
  verify_command?: string
  /**
   * Reference docs for **this** todo only (planning JSON). Copied into the sandbox
   * before execution; used for form lookup and injected context for this step.
   */
  reference_doc?: ReferenceDoc[]
  /**
   * Reference scripts for **this** todo only (planning JSON). Copied under
   * `<sandbox>/scripts/` before this step runs.
   */
  reference_scripts?: ReferenceScript[]
  /**
   * Optional hint: basename of a skill `.form.md` (e.g. `my.form.md`) used when execution-time
   * readiness decides form collection is needed. Does not by itself trigger the form UI;
   * see {@link assessTodoFormReadiness} in the form module.
   */
  form_doc_name?: string
}

export interface StepOutputs {
  thinking?: ThinkingResult
  planning?: PlanningResult
  skills?: string
  toolLoop?: string
  summary?: SummaryResult
  report?: string
  prompt?: string
}

function deepClone<T>(value: T): T {
  try {
    return structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

export function cloneStepOutputs(outputs: StepOutputs): StepOutputs {
  return deepClone(outputs)
}

export function cloneAgentMessages(
  messages: AgentMessage[],
): AgentMessage[] {
  return deepClone(messages)
}

export type AgentStepId =
  | 'thinking'
  | 'planning'
  | 'skills'
  | 'toolLoop'
  | 'foreachItem'
  | 'search'
  | 'webScrape'
  | 'createPaper'
  | 'summary'
  | 'report'
  | 'prompt'
  | 'collectFormData'

export type AgentStepProgressPayload = {
  stepKey: string
  stepId: AgentStepId
  title: string
  sequence: number
  content: string
  status: 'running' | 'completed'
  goal?: string
  summary?: string
  attachments?: StepAttachment[]
  /** Unique id for this {@link AgentRun} instance (nested sub-flows). */
  runId?: string
  /** Alias for {@link runId} — flow scope for nested HITL resume. */
  flowId?: string
  /** Parent run when this progress event is from a nested sub-agent. */
  parentRunId?: string
  /** Scoped pipeline stage when paused for HITL (`flowId:stageId`). */
  scopedStageId?: string
}

export type SubAgentRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'awaiting_approval'

export type SubAgentRunLifecycleEvent =
  | {
      kind: 'started'
      runId: string
      parentRunId: string
      rootRunId: string
      agentId: string
      agentName: string
      task: string
      waitMode: 'blocking' | 'background'
      /** Cursor-style profile (`explore` | `bash` | …) when delegated via profile. */
      profile?: string
      worktreePath?: string
      worktreeBranch?: string
      /** When true, parent finished while this run continues (detachable). */
      detached?: boolean
    }
  | {
      kind: 'finished'
      runId: string
      parentRunId: string
      rootRunId: string
      agentId: string
      agentName: string
      status: SubAgentRunStatus
      profile?: string
      reportPreview?: string
      error?: string
      worktreePath?: string
      worktreeBranch?: string
      worktreeDiffStat?: string
      detached?: boolean
    }

export interface AgentStepContext {
  key: string
  stepId: AgentStepId
  title: string
  sequence: number
  startedAt: string
  completedAt?: string
  inputMessages: AgentMessage[]
  goal?: string
  summary?: string
  renderedOutput?: string
  output?: unknown
  previousStepKey?: string
  previousStepId?: AgentStepId
  previousOutput?: unknown
  meta?: Record<string, unknown>
}

export type AgentStepContextMap = Partial<Record<AgentStepId, AgentStepContext>>
export type AgentStepContextHistory = AgentStepContext[]

/** Pipeline summary of goal, planning, and execution — input to the report step. */
export type SummaryResult = {
  /** Factual recap of goal, plan, and execution. */
  summary: string
  /** Whether the user's final goal was achieved. */
  goalAchieved: boolean
  /** What else could be done to achieve the goal better (tools, scope, or strategy). */
  waysToAchieveGoalBetter: string
  /** When true, persist a summary insight to the agent memory repo for future runs. */
  shouldMemorize: boolean
  /** Why this run is worth remembering (used when {@link shouldMemorize} is true). */
  memorizeReason: string
}

export type AssistantSubStepType =
  | 'ThinkingStep'
  | 'PlanningStep'
  | 'CollectFormDataStep'
  | 'SkillsToolExecutionStep'
  | 'SearchStep'
  | 'WebScrapeStep'
  | 'CreatePaperStep'
  | 'SummaryStep'
  | 'ReportStep'

/** Per-step snapshot for the structured assistant payload (content + artifact paths). */
export interface StepRunCapture {
  stepType: AssistantSubStepType
  title: string
  /** Full textual output for this step. */
  content: string
  /** Filesystem paths referenced or produced (absolute sandbox paths when applicable). */
  outputPaths: string[]
  /** Files produced by tools during this step. */
  attachments?: StepAttachment[]
  /** @deprecated Legacy field — converted to attachments on load. */
  outputLinks?: Array<{ label: string; url: string }>
}

export interface AssistantSubStep {
  type: AssistantSubStepType
  title: string
  content: string
}

/** PDF export of the rendered final result (see {@link writeFinalResultToSandbox}). */
export interface ResultSnapshotRef {
  pdfPath: string
  pdfUrl: string
}

/** PDF research report from the createPaper pipeline step. */
export interface ResearchReportRef {
  pdfPath: string
  pdfUrl: string
  topic: string
  sourceCount: number
  /** Markdown excerpt for chat (full paper is in the PDF). */
  paperExcerpt?: string
}

/** One conversation bubble persisted from a completed pipeline step. */
export interface PipelineConversationTurn {
  sectionId: string
  stepId: AgentStepId
  title: string
  content: string
  status: 'completed'
  attachments?: StepAttachment[]
  stepKey?: string
  sequence?: number
}

export interface AssistantStructuredContent {
  version: 2
  assistantContent: {
    outer: {
      streamingText?: string
      /** Aggregated summary built from every executed step (see buildStructuredAssistantContent). */
      finalResult: string
      report: string
      /** Ordered captures mirroring sub-steps — content + paths for exports and auditing. */
      stepCaptures?: StepRunCapture[]
      /** Deduped list of all artifact paths across steps + sandbox layout hints. */
      allArtifactPaths?: string[]
      /** PDF snapshot of the final HTML result for download and chat preview. */
      resultSnapshot?: ResultSnapshotRef
      /** PDF research report (`createPaper` / `createResearchReport` step). */
      researchReport?: ResearchReportRef
      /** Step-by-step bubbles for conversation mode after reload. */
      pipelineConversation?: PipelineConversationTurn[]
    }
    subSteps: AssistantSubStep[]
  }
}
