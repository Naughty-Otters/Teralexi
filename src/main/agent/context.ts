import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { z } from 'zod'
import type {
  AgentResponseOpts,
  AgentMessage,
  AgentStepContext as AgentStepSnapshot,
  AgentStepContextHistory,
  AgentStepContextMap,
  AgentStepId,
  AgentStepProgressPayload,
  StepOutputs,
  RuntimeToolMeta,
  AssistantSubStep,
  AssistantStructuredContent,
  StepRunCapture,
  ThinkingResult,
  PlanningResult,
  SummaryResult,
  ResearchReportRef,
  SkillChainPlan,
} from './types'
import type { ParsedCollectFormSchema } from './form/schema'
import type { ResearchResumeState } from './steps/research/config'
import type { AgentLlmStage } from '@shared/agent/stage-llm-settings'
import {
  limitMessageContentForPersistence,
  limitPersistedStepText,
} from '@shared/persistence/limit-persisted-content'
import {
  hasToolLoopRecoveryOverride,
  resolveToolLoopExecutionChoice as resolveToolLoopExecutionChoiceFromSettings,
  type AgentLlmChoice,
  type AgentStageLlmSettings,
} from '@shared/agent/stage-llm-settings'
import { ConfigContext } from './config/context'
import { StageModelRegistry } from './providers/stage-model-registry'
import type { FlowPipelineRegistry, FlowStepConfig } from './flow/pipeline'
import type { FlowStageId } from './constants/step-ids'
import { ReferenceContext } from './resources/context'
import { FormContext, type FormFlowHost } from './form/context'
import { formatPlanningExpectations } from './utils/agent-parsing'
import {
  formatSummaryForContext,
  summaryDisplayText,
} from './utils/summary-parse'
import { ProviderContext } from './providers/context'
import { SandboxContext } from './sandbox/context'
import {
  buildOutputLinksFromPaths,
  collectOutputLinksForStep,
  collectSandboxOutputLinkPaths,
  sandboxOutputDir,
} from './sandbox/step-output-links'
import { formatToolResultForDisplay } from '@shared/tool-result/format-tool-result-for-display'
import { isMandatoryTool } from '@shared/agent/mandatory-tools'
import { PLAN_MODE_ALWAYS_IN_CATALOG_TOOL_NAMES } from '@toolSet/planning'
import { isPlanModeActive } from './coding/plan-mode-state'
import { isSubAgentAgentRun } from './run/sub-agent-run-policy'
import { createLogger } from '@main/logger'
import type { ToolInputDedupeState } from './steps/step-helpers'
import { ToolReadCache } from './expr/tool-read-cache'

function formatAgentStepOutputBody(
  step: Pick<AgentStepSnapshot, 'renderedOutput' | 'output'>,
): string {
  const rendered = step.renderedOutput?.trim()
  if (rendered) return rendered
  if (typeof step.output === 'string') return step.output.trim()
  if (step.output != null) return formatToolResultForDisplay(step.output)
  return ''
}
import {
  ensureScopedStepKey,
  formatScopedStageId,
  formatScopedStepInstanceKey,
  randomShortId,
  stageIdForPipelineLookup,
  toolLoopFilesystemScopeFromStepKey,
} from './run/flow-scoped-ids'
import { getCurrentAgentRunScope } from './run/run-scope'
import { PIPELINE_CONTEXT_LLM, STRUCTURED_CONTENT_LLM } from './constants'
import {
  COLLECT_FORM_STEP_ID,
  FOREACH_ITEM_STEP_ID,
  PLANNING_STEP_ID,
  PROMPT_STEP_ID,
  REPORT_STEP_ID,
  SEARCH_STEP_ID,
  WEB_SCRAPE_STEP_ID,
  CREATE_PAPER_STEP_ID,
  SKILLS_STEP_ID,
  SUMMARY_STEP_ID,
  THINKING_STEP_ID,
  TOOL_LOOP_STEP_ID,
  TOOL_LOOP_STEP_TITLE,
} from './constants/step-ids'
import {
  isAgenticRunParentStepTitle,
  isAgenticRunPerTaskStepTitle,
} from '@shared/agent/agentic-run-labels'
import { StepOutputStore } from './steps/step-output-store'
import type {
  CreatePaperStepData,
  StepData,
  StepOutputEntry,
} from './steps/step-io'
import type { AgentRun } from './run/agent-run'
import { buildPipelineConversationTurns } from './pipeline-conversation-persist'
import {
  dedupeStepAttachments,
  mergeStepAttachments,
  type StepAttachment,
} from '@shared/agent/step-attachment'

function uniqueStrings(paths: string[]): string[] {
  return [...new Set(paths.map((p) => p.trim()).filter(Boolean))]
}

function flowStageIdForStepCapture(
  stepType: StepRunCapture['stepType'],
): FlowStageId | undefined {
  switch (stepType) {
    case 'ThinkingStep':
      return THINKING_STEP_ID
    case 'PlanningStep':
      return PLANNING_STEP_ID
    case 'SearchStep':
      return SEARCH_STEP_ID
    case 'WebScrapeStep':
      return WEB_SCRAPE_STEP_ID
    case 'CreatePaperStep':
      return CREATE_PAPER_STEP_ID
    case 'SkillsToolExecutionStep':
      return TOOL_LOOP_STEP_ID
    case 'SummaryStep':
      return SUMMARY_STEP_ID
    case 'ReportStep':
      return REPORT_STEP_ID
    default:
      return undefined
  }
}

function buildResearchReportRef(
  outputStore: StepOutputStore,
): ResearchReportRef | undefined {
  const entries = outputStore.all(CREATE_PAPER_STEP_ID)
  if (entries.length === 0) return undefined
  const data = entries[entries.length - 1]?.data as
    | CreatePaperStepData
    | undefined
  const pdfPath = data?.outputPath?.trim()
  if (!pdfPath) return undefined
  try {
    const paperExcerpt = data.rendered?.trim() || data.text?.trim()
    return {
      pdfPath,
      pdfUrl: pathToFileURL(pdfPath).href,
      topic: data.topic ?? '',
      sourceCount: data.sourceCount ?? 0,
      ...(paperExcerpt ? { paperExcerpt } : {}),
    }
  } catch {
    return undefined
  }
}

function latestCreatePaperDigest(outputStore: StepOutputStore): string {
  const entries = outputStore.all(CREATE_PAPER_STEP_ID)
  if (entries.length === 0) return ''
  const data = entries[entries.length - 1]?.data as
    | CreatePaperStepData
    | undefined
  return data?.rendered?.trim() || data?.text?.trim() || ''
}

const STEP_OUTPUT_KEY_BY_ID = {
  [THINKING_STEP_ID]: 'thinking',
  [PLANNING_STEP_ID]: 'planning',
  [SKILLS_STEP_ID]: 'skills',
  [TOOL_LOOP_STEP_ID]: 'toolLoop',
  [SUMMARY_STEP_ID]: 'summary',
  [REPORT_STEP_ID]: 'report',
  [PROMPT_STEP_ID]: 'prompt',
} as const satisfies Partial<Record<AgentStepId, keyof StepOutputs>>

export type PipelineContextMessageOptions = {
  /** Skills + tool-loop material (default true). */
  execution?: boolean
  /** Thinking digest (e.g. report). */
  thinking?: boolean
  /** Planning text / final goal (e.g. report). */
  planning?: boolean
  /** Pipeline summary (goal, plan, execution) for the report step. */
  summary?: boolean
  /**
   * Analysis/report: include final goal, ordered planned tasks, and per-todo tool
   * output (not the raw history aggregate that duplicates batch rollups under HITL).
   */
  orderedExecution?: boolean
}

function deepClone<T>(value: T): T {
  try {
    return structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

export function cloneStepContextMap(
  value: AgentStepContextMap,
): AgentStepContextMap {
  return deepClone(value)
}

export function cloneStepHistory(
  value: AgentStepContextHistory,
): AgentStepContextHistory {
  return deepClone(value)
}

/** Sandbox dirs where artifacts typically land (for path hints on exports). */
export function collectSandboxArtifactPaths(
  sandbox?: SandboxContext,
): string[] {
  const layout = sandbox?.layout
  if (!layout) return []
  return uniqueStrings([
    layout.root,
    layout.outputDir,
    join(layout.root, 'output', 'results'),
    join(layout.root, 'output', 'toolLoop'),
    layout.refsDir,
    layout.scriptsDir,
  ])
}

export {
  isAssistantStructuredContent,
  parseAssistantStructuredContent,
  serializeAssistantMessageForHistory,
} from './utils'

export type StepContextCreator = (
  flowContext: AgentFlowContext,
  stepId: AgentStepId,
  title: string,
  instanceKey: string,
  flowStepConfig?: FlowStepConfig,
) => AgentStepContext

const stepContextCreators = new Map<AgentStepId, StepContextCreator>()

export function registerStepContextCreator(
  stepId: AgentStepId,
  creator: StepContextCreator,
): void {
  stepContextCreators.set(stepId, creator)
}

export class AgentFlowContext {
  public currentMessages: AgentMessage[] = []
  public stepOutputs: StepOutputs = {}
  public readonly outputStore = new StepOutputStore()
  /** Per user-turn cache for successful `read_file` results (invalidated on mtime change). */
  public readonly toolReadCache = new ToolReadCache()
  /** Shared in-flight / succeeded dedupe keys across tool-loop streams in one turn. */
  public readonly toolInputDedupeState: ToolInputDedupeState = {
    inflightByKey: new Map(),
    succeededKeys: new Set(),
  }
  public stepContexts: AgentStepContextMap = {}
  public stepHistory: AgentStepContextHistory = []
  private readonly stepProgressTextByKey = new Map<string, string>()
  private readonly stepAttachmentsByKey = new Map<string, StepAttachment[]>()
  /**
   * Tool loop emitted a `tool-approval-request` UI chunk; execution must pause until
   * the client sends approval via {@link AgentResponseOpts.clientUiMessages} on the next run.
   * Prevents Analysis/Report (and further todos) from running while the user decides.
   */
  public hitlAwaitingApproval = false
  /** Zero-based tool-loop iteration within a turn (increments on HITL resume). */
  public toolLoopIteration = 0
  /**
   * {@link CollectFormDataStep} emitted `data-collect-form-request`; wait for client
   * `data-collect-form-response` on the next run (see execution pending state).
   */
  public hitlAwaitingFormData = false
  /**
   * A todo with `fallback_plan: manual_intervention` failed; wait for the user to send
   * a follow-up message before resuming the foreach batch at {@link resumeTodoIndex}.
   */
  public hitlAwaitingManualIntervention = false
  /**
   * Set by expression `else_goto`; consumed once by {@link executeFlowPipeline}
   * to jump to another resolved pipeline stage.
   */
  public pipelineGotoStageId?: FlowStageId
  /** User-submitted field values keyed by todo id (same assistant stream). */
  public collectedFormByTodoId: Record<number, Record<string, unknown>> = {}
  /**
   * After tool-approval resume: only this todo index may replay `clientUiMessages`
   * (avoids injecting prior todos' full tool thread into later steps).
   */
  public approvalResumeTodoIndex?: number
  /**
   * Scoped stage where the pipeline paused for HITL (`flowId:stageId`).
   * Legacy pending entries may store an unscoped stage id only.
   */
  public lastHitlPausedStageId?: string
  /** When resuming from HITL, the todo index to continue from in ForEachItemOrchestrator. */
  public resumeTodoIndex?: number
  /**
   * Next todo tool-loop should use the failure-recovery LLM (after manual-intervention follow-up).
   * Cleared after that todo run completes.
   */
  public todoRecoveryAttempt = false
  /** Snapshot for resuming the research loop after HITL tool approval. */
  public researchResumeState?: ResearchResumeState
  /**
   * Normalized markdown link target → fetched body. One network/disk read per key
   * per agent run; {@link appendLinkedMarkdownReferenceSections} uses this when expanding
   * links in skill/tool execution prompts only.
   */
  public markdownReferenceBodyByKey = new Map<string, string>()
  /** Ordered plan produced by the skill-chain-planning step. */
  public skillChainPlan?: SkillChainPlan
  /** Accumulated outputs keyed by agentId, populated by forEachSkill. */
  public skillChainResults: Map<string, string> = new Map()
  /**
   * LLM-generated form schemas keyed by todo id.
   * Populated by {@link CollectFormDataStep} when `form_doc_name` doesn't match a predefined file.
   * Persisted to / restored from {@link PendingAgentExecution} so schemas survive HITL pauses.
   */
  public generatedFormSchemaByTodoId: Map<number, ParsedCollectFormSchema> = new Map()
  /** Pipeline step registry; set by AgentFlow after construction for rendering contract access. */
  public pipelineRegistry?: FlowPipelineRegistry
  /** Active {@link AgentRun} when executing via the run instance model. */
  public agentRun?: AgentRun
  readonly config: ConfigContext
  readonly providers: ProviderContext
  readonly stageModels: StageModelRegistry
  readonly references: ReferenceContext
  readonly sandbox: SandboxContext
  readonly form: FormContext
  public readonly validationSchema = z.object({
    valid: z.boolean(),
    messages: z.array(z.string()),
  })
  private readonly log = createLogger('agent.context')
  private nextStepSequence = 1

  constructor(
    public readonly opts: AgentResponseOpts,
    model: unknown,
    stageModels?: StageModelRegistry,
  ) {
    this.currentMessages = [...opts.messages]
    this.config = new ConfigContext(() => opts.responseLanguage)
    this.stageModels = stageModels ?? StageModelRegistry.fromOpts(opts)
    this.providers = new ProviderContext(opts, model)
    this.references = new ReferenceContext()
    this.sandbox = new SandboxContext(this.references)
    this.form = new FormContext(this as AgentFlowContext & FormFlowHost)
  }

  get model() {
    return this.providers.model
  }

  resolveStageModel(stage: AgentLlmStage): unknown {
    return this.stageModels.getModel(stage)
  }

  resolveStageChoice(stage: AgentLlmStage) {
    return this.stageModels.getChoice(stage)
  }

  resolveToolLoopExecutionChoice(isRecoveryAttempt: boolean): AgentLlmChoice {
    return resolveToolLoopExecutionChoiceFromSettings(
      this.stageLlmSettings(),
      isRecoveryAttempt,
    )
  }

  resolveToolLoopExecutionModel(isRecoveryAttempt: boolean): unknown {
    if (
      isRecoveryAttempt &&
      hasToolLoopRecoveryOverride(this.stageLlmSettings().stages)
    ) {
      return this.stageModels.getModel('toolLoopRecovery')
    }
    return this.resolveStageModel('toolLoop')
  }

  private stageLlmSettings(): AgentStageLlmSettings {
    if (this.opts.stageLlm) return this.opts.stageLlm
    return {
      mode: 'unified',
      default: { provider: this.opts.provider, model: this.opts.model },
    }
  }

  /** Active run id (flow scope) for nested HITL and scoped step keys. */
  get flowId(): string {
    return (
      getCurrentAgentRunScope()?.runId ?? this.agentRun?.meta.runId ?? 'root'
    )
  }

  setHitlPausedAtStage(stageId: FlowStageId): void {
    this.lastHitlPausedStageId = formatScopedStageId(this.flowId, stageId)
  }

  /** Pipeline stage id to resume in this run from a scoped or legacy paused id. */
  resumeStageIdFromScoped(scoped?: string): FlowStageId | undefined {
    if (!scoped?.trim()) return undefined
    return stageIdForPipelineLookup(scoped, this.flowId)
  }

  /** {@link FormFlowHost} — HITL form/approval UI thread from the client. */
  get clientUiMessages() {
    return this.opts.clientUiMessages
  }

  getSandboxRoot(): string | undefined {
    return this.sandbox.getRoot()
  }


  get executionSteps() {
    return this.opts.executionSteps
  }

  get skillsOutput() {
    const fromStore = this.outputStore.latest<
      import('./steps/step-io').TextStepData
    >(SKILLS_STEP_ID as FlowStageId)
    return fromStore?.text ?? this.stepOutputs.skills ?? ''
  }

  get skillId() {
    return this.opts.skillId
  }

  get stepContextState() {
    return this.stepContexts
  }

  get stepHistoryState() {
    return this.stepHistory
  }

  createStepContext(
    stepId: AgentStepId,
    title: string,
    flowStepConfig?: FlowStepConfig,
  ): AgentStepContext {
    const instanceKey = formatScopedStepInstanceKey(
      this.flowId,
      stepId,
      randomShortId(),
    )
    const creator = stepContextCreators.get(stepId)
    if (creator) {
      return creator(this, stepId, title, instanceKey, flowStepConfig)
    }
    return new AgentStepContext(
      this,
      stepId,
      title,
      instanceKey,
      flowStepConfig,
    )
  }

  requestPipelineGoto(stageId: FlowStageId): void {
    this.pipelineGotoStageId = stageId
  }

  consumePipelineGoto(): FlowStageId | undefined {
    const stageId = this.pipelineGotoStageId
    this.pipelineGotoStageId = undefined
    return stageId
  }

  get runtimeTools(): RuntimeToolMeta[] {
    const skillTools = this.executionSteps?.toolLoop?.tools ?? []
    const mcpTools = this.opts.mcpTools ?? []
    const availableSet = this.opts.availableSet
    const planModeActive =
      !isSubAgentAgentRun(this) && isPlanModeActive(this.opts.conversationId)
    const filteredSkillTools = Array.isArray(availableSet)
      ? skillTools.filter(
          (tool) =>
            availableSet.includes(tool.name) ||
            isMandatoryTool(tool.name) ||
            (planModeActive &&
              PLAN_MODE_ALWAYS_IN_CATALOG_TOOL_NAMES.has(tool.name)),
        )
      : skillTools
    const overrides = this.opts.toolNeedsApprovalOverrides ?? {}
    const applyApproval = (tool: RuntimeToolMeta): RuntimeToolMeta => {
      const o = overrides[tool.name]
      if (typeof o !== 'boolean') return tool
      return { ...(tool as object), needsApproval: o } as RuntimeToolMeta
    }
    return [
      ...filteredSkillTools.map((t) => applyApproval(t)),
      ...mcpTools.map((t) => applyApproval(t)),
    ]
  }

  reset() {
    this.currentMessages = [...this.opts.messages]
    this.stepOutputs = {}
    this.stepContexts = {}
    this.stepHistory = []
    this.stepProgressTextByKey.clear()
    this.hitlAwaitingApproval = false
    this.hitlAwaitingFormData = false
    this.hitlAwaitingManualIntervention = false
    this.todoRecoveryAttempt = false
    this.researchResumeState = undefined
    this.collectedFormByTodoId = {}
    this.markdownReferenceBodyByKey.clear()
    this.nextStepSequence = 1
  }

  resetForNextValidationAttempt(preserveStepIds: AgentStepId[] = []) {
    const preservedHistory = cloneStepHistory(
      this.getOrderedStepContexts().filter((step) =>
        preserveStepIds.includes(step.stepId),
      ),
    )
    const preserved = cloneStepContextMap(
      Object.fromEntries(
        preserveStepIds
          .map((stepId) => {
            const stepContext = this.stepContexts[stepId]
            return stepContext ? [stepId, stepContext] : null
          })
          .filter(
            (entry): entry is [AgentStepId, AgentStepSnapshot] => entry != null,
          ),
      ) as AgentStepContextMap,
    )

    this.reset()

    if (Object.keys(preserved).length === 0) return

    this.stepContexts = preserved
    this.stepHistory = preservedHistory
    this.rebuildStepOutputsFromHistory()
    this.nextStepSequence =
      Math.max(0, ...this.stepHistory.map((step) => step.sequence)) + 1
    this.rebuildCurrentMessagesFromStepContexts()
  }

  restoreStepState(
    stepOutputs: StepOutputs,
    stepContexts: AgentStepContextMap = {},
    stepHistory: AgentStepContextHistory = [],
    currentMessages?: AgentMessage[],
  ) {
    this.stepOutputs = stepOutputs
    this.stepContexts = cloneStepContextMap(stepContexts)
    this.stepHistory = cloneStepHistory(stepHistory)
    this.stepProgressTextByKey.clear()
    this.currentMessages = currentMessages
      ? [...currentMessages]
      : [...this.opts.messages]
    this.nextStepSequence =
      Math.max(
        0,
        ...this.getOrderedStepContexts().map((step) => step.sequence),
      ) + 1
    this.rebuildStepOutputsFromHistory()
    this.rebuildOutputStoreFromHistory()
  }

  /**
   * User messages built from {@link stepOutputs} after recovering all completed steps
   * from {@link stepHistory}. Used by summary and report.
   */
  buildPipelineContextMessages(
    opts: PipelineContextMessageOptions = {},
  ): AgentMessage[] {
    const includeExecution = opts.execution !== false
    const messages: AgentMessage[] = []
    const reg = this.pipelineRegistry

    if (opts.thinking) {
      const def = reg?.get(THINKING_STEP_ID)
      const entries = this.outputStore.all(THINKING_STEP_ID)
      if (def?.toContextMessages && entries.length > 0) {
        messages.push(...def.toContextMessages(entries, this))
      } else {
        const raw = this.stepOutputs.thinking?.raw?.trim()
        if (raw) {
          messages.push({
            role: 'user',
            content: `${PIPELINE_CONTEXT_LLM.THINKING}\n\n${raw}`,
          })
        }
      }
    }

    if (opts.planning) {
      const def = reg?.get(PLANNING_STEP_ID)
      const entries = this.outputStore.all(PLANNING_STEP_ID)
      if (def?.toContextMessages && entries.length > 0) {
        messages.push(...def.toContextMessages(entries, this))
      } else {
        const plan = this.stepOutputs.planning
        const planText = plan?.raw?.trim() || plan?.finalGoal?.trim()
        if (planText) {
          messages.push({
            role: 'user',
            content: `${PIPELINE_CONTEXT_LLM.PLANNING}\n\n${planText}`,
          })
        }
      }
    }

    if (opts.orderedExecution) {
      const plan = this.stepOutputs.planning
      const finalGoal = plan?.finalGoal?.trim()
      if (finalGoal) {
        messages.push({
          role: 'user',
          content: `${PIPELINE_CONTEXT_LLM.FINAL_GOAL}\n\n${finalGoal}`,
        })
      }
      const planData =
        this.outputStore.latest<import('./steps/step-io').PlanningStepData>(
          PLANNING_STEP_ID,
        )
      const expectations = plan?.expectations ?? planData?.expectations ?? []
      if (expectations.length > 0) {
        messages.push({
          role: 'user',
          content: `${PIPELINE_CONTEXT_LLM.RUN_EXPECTATIONS}\n\n${formatPlanningExpectations(expectations)}`,
        })
      }
      const outline = this.formatPlannedTasksOutlineForSummary()
      if (outline) {
        messages.push({
          role: 'user',
          content: `${PIPELINE_CONTEXT_LLM.PLANNED_TASKS}\n\n${outline}`,
        })
      }
    }

    if (includeExecution) {
      const searchDef = reg?.get(SEARCH_STEP_ID)
      const searchEntries = this.outputStore.all(SEARCH_STEP_ID)
      if (searchDef?.toContextMessages && searchEntries.length > 0) {
        messages.push(...searchDef.toContextMessages(searchEntries, this))
      }

      const webScrapeDef = reg?.get(WEB_SCRAPE_STEP_ID)
      const webScrapeEntries = this.outputStore.all(WEB_SCRAPE_STEP_ID)
      if (webScrapeDef?.toContextMessages && webScrapeEntries.length > 0) {
        messages.push(...webScrapeDef.toContextMessages(webScrapeEntries, this))
      }

      const createPaperDef = reg?.get(CREATE_PAPER_STEP_ID)
      const createPaperEntries = this.outputStore.all(CREATE_PAPER_STEP_ID)
      if (createPaperDef?.toContextMessages && createPaperEntries.length > 0) {
        messages.push(
          ...createPaperDef.toContextMessages(createPaperEntries, this),
        )
      }

      const def = reg?.get(TOOL_LOOP_STEP_ID)
      const entries = this.outputStore.all(TOOL_LOOP_STEP_ID)
      if (
        def?.toContextMessages &&
        entries.length > 0 &&
        !opts.orderedExecution
      ) {
        messages.push(...def.toContextMessages(entries, this))
      } else {
        const skills = this.stepOutputs.skills?.trim()
        if (skills) {
          messages.push({
            role: 'user',
            content: `${PIPELINE_CONTEXT_LLM.SKILLS_OUTPUT}\n\n${skills}`,
          })
        }
        if (opts.orderedExecution) {
          const ordered = this.formatOrderedExecutionForSummary()
          if (ordered.toolExecution?.trim()) {
            messages.push({
              role: 'user',
              content: `${PIPELINE_CONTEXT_LLM.TOOL_EXECUTION_ORDERED}\n\n${ordered.toolExecution.trim()}`,
            })
          }
          if (ordered.skillsFallback?.trim()) {
            messages.push({
              role: 'user',
              content: `${PIPELINE_CONTEXT_LLM.SKILLS_OUTPUT}\n\n${ordered.skillsFallback.trim()}`,
            })
          }
        } else {
          const toolLoop = this.stepOutputs.toolLoop?.trim()
          if (toolLoop) {
            messages.push({
              role: 'user',
              content: `${PIPELINE_CONTEXT_LLM.TOOL_EXECUTION_OUTPUT}\n\n${toolLoop}`,
            })
          }
        }
      }

      // Append collected form values so downstream steps (summary, retry) see what was submitted.
      const formEntries = Object.entries(this.collectedFormByTodoId)
      if (formEntries.length > 0) {
        const lines = formEntries
          .map(([id, vals]) => `Todo #${id}: ${JSON.stringify(vals)}`)
          .join('\n')
        messages.push({
          role: 'user',
          content: `Collected form data:\n${lines}`,
        })
      }
    }

    if (opts.summary) {
      const def = reg?.get(SUMMARY_STEP_ID)
      const entries = this.outputStore.all(SUMMARY_STEP_ID)
      if (def?.toContextMessages && entries.length > 0) {
        messages.push(...def.toContextMessages(entries, this))
      } else if (this.stepOutputs.summary?.summary?.trim()) {
        messages.push({
          role: 'user',
          content: `${PIPELINE_CONTEXT_LLM.RUN_SUMMARY}\n\n${formatSummaryForContext(this.stepOutputs.summary)}`,
        })
      }
    }

    return messages
  }

  /** Last user message in the thread (walks backward). Falls back to last message content if none. */
  getLatestUserMessageContent(): string {
    for (let i = this.currentMessages.length - 1; i >= 0; i--) {
      const m = this.currentMessages[i]
      if (m.role === 'user') return m.content
    }
    return this.currentMessages[this.currentMessages.length - 1]?.content ?? ''
  }

  /**
   * Appends a new assistant turn without replacing the previous one. Use after
   * each pipeline step so {@link currentMessages} carries Thinking → Planning →
   * execution → summary → report for any caller that passes the full thread to
   * the model.
   */
  appendAssistantTurn(content: string) {
    this.currentMessages = [
      ...this.currentMessages,
      { role: 'assistant', content },
    ]
  }

  /**
   * Sets or appends the latest assistant turn. If the last message is already
   * from the assistant (e.g. streaming placeholder), it is replaced; if the last
   * message is from the user — typical when {@link AgentResponseOpts.messages}
   * ends with the latest user turn — a new assistant message is **appended** so
   * we never drop the user message.
   *
   * Prefer {@link appendAssistantTurn} when finishing a **pipeline step** so
   * prior step outputs stay in the thread for the next step.
   */
  appendAssistantMessage(content: string) {
    const msgs = this.currentMessages
    if (msgs.length === 0) {
      this.currentMessages = [{ role: 'assistant', content }]
      return
    }
    const last = msgs[msgs.length - 1]
    if (last.role === 'assistant') {
      this.currentMessages = [
        ...msgs.slice(0, -1),
        { role: 'assistant', content },
      ]
    } else {
      this.currentMessages = [...msgs, { role: 'assistant', content }]
    }
  }

  buildStructuredAssistantContent(): string {
    const reg = this.pipelineRegistry
    const planning = this.stepOutputs.planning
    const planRaw = planning?.raw?.trim() ?? ''
    const toolOutput = this.stepOutputs.toolLoop?.trim() ?? ''
    const skillsOutput = this.stepOutputs.skills?.trim() ?? ''
    const runSummary = this.stepOutputs.summary
      ? summaryDisplayText(this.stepOutputs.summary)
      : ''
    const report = this.stepOutputs.report?.trim() ?? ''

    const subSteps: AssistantSubStep[] = []
    const stepCaptures: StepRunCapture[] = []

    const sandboxOutputPaths = collectSandboxOutputLinkPaths(this.sandbox)

    const thinkingRaw = this.stepOutputs.thinking?.raw?.trim() ?? ''
    const directAnswerResponse =
      this.stepOutputs.thinking?.execution_mode === 'direct_answer'
        ? this.stepOutputs.thinking?.response?.trim() ?? ''
        : ''

    const stageOrder: FlowStageId[] = [
      THINKING_STEP_ID,
      PLANNING_STEP_ID,
      SEARCH_STEP_ID,
      WEB_SCRAPE_STEP_ID,
      CREATE_PAPER_STEP_ID,
      TOOL_LOOP_STEP_ID,
      SUMMARY_STEP_ID,
      REPORT_STEP_ID,
    ]
    if (reg) {
      for (const stageId of stageOrder) {
        const def = reg.get(stageId)
        const entries = this.outputStore.all(stageId)
        if (!def || entries.length === 0) continue
        const sub = def.toSubStep?.(entries, this)
        if (sub) subSteps.push(sub)
        const cap = def.toStepCapture?.(entries, this)
        if (cap) stepCaptures.push(cap)
      }
    } else {
      if (thinkingRaw) {
        subSteps.push({
          type: 'ThinkingStep',
          title: 'Thinking',
          content: thinkingRaw,
        })
        stepCaptures.push({
          stepType: 'ThinkingStep',
          title: 'Thinking',
          content: thinkingRaw,
          outputPaths: [],
        })
      }
      if (planRaw) {
        subSteps.push({
          type: 'PlanningStep',
          title: 'Planning',
          content: planRaw,
        })
        stepCaptures.push({
          stepType: 'PlanningStep',
          title: 'Planning',
          content: planRaw,
          outputPaths: [],
        })
      }
      const toolExecutionContent = [toolOutput, skillsOutput]
        .filter(Boolean)
        .join('\n\n')
        .trim()
      if (toolExecutionContent) {
        subSteps.push({
          type: 'SkillsToolExecutionStep',
          title: TOOL_LOOP_STEP_TITLE,
          content: toolExecutionContent,
        })
        stepCaptures.push({
          stepType: 'SkillsToolExecutionStep',
          title: TOOL_LOOP_STEP_TITLE,
          content: toolExecutionContent,
          outputPaths:
            sandboxOutputPaths.length > 0 ? [...sandboxOutputPaths] : [],
        })
      }
      if (runSummary) {
        subSteps.push({
          type: 'SummaryStep',
          title: 'Summary',
          content: runSummary,
        })
        stepCaptures.push({
          stepType: 'SummaryStep',
          title: 'Summary',
          content: runSummary,
          outputPaths: [],
        })
      }
      if (report) {
        subSteps.push({ type: 'ReportStep', title: 'Report', content: report })
        const reportPaths =
          this.sandbox.layout != null
            ? [
                join(
                  this.sandbox.layout.root,
                  'output',
                  'results',
                  'result-snapshot.pdf',
                ),
              ]
            : []
        stepCaptures.push({
          stepType: 'ReportStep',
          title: 'Report',
          content: report,
          outputPaths: reportPaths,
        })
      }
    }

    const planningRefPaths = uniqueStrings(
      (planning?.todoList ?? []).flatMap((t) => [
        ...(t.reference_doc?.map((d) =>
          this.references.referenceLocationString(d),
        ) ?? []),
        ...(t.reference_scripts?.map((s) =>
          this.references.referenceLocationString(s),
        ) ?? []),
      ]),
    )

    const completedTodoOutputs =
      planning?.todoList
        .filter((item) => item.status === 'completed' && item.output?.trim())
        .map(
          (item) =>
            `${STRUCTURED_CONTENT_LLM.COMPLETED_TASK.replace('{id}', String(item.id)).replace('{description}', item.description)}\n${item.output!.trim()}`,
        ) ?? []

    const finalGoalResult =
      completedTodoOutputs.length > 0
        ? [
            planning?.finalGoal?.trim()
              ? `${STRUCTURED_CONTENT_LLM.GOAL_PREFIX} ${planning.finalGoal.trim()}`
              : '',
            ...completedTodoOutputs,
          ]
            .filter(Boolean)
            .join('\n\n')
        : ''

    const toolExecutionContent = [toolOutput, skillsOutput]
      .filter(Boolean)
      .join('\n\n')
      .trim()
    const createPaperDigest = latestCreatePaperDigest(this.outputStore)

    const aggregatedSections: string[] = []
    if (directAnswerResponse) {
      aggregatedSections.push(directAnswerResponse)
    }
    if (thinkingRaw) {
      aggregatedSections.push(
        `${STRUCTURED_CONTENT_LLM.SECTION_THINKING}\n\n${thinkingRaw}`,
      )
    }
    if (finalGoalResult) {
      aggregatedSections.push(
        `${STRUCTURED_CONTENT_LLM.SECTION_GOALS_COMPLETED}\n\n${finalGoalResult}`,
      )
    } else if (planRaw) {
      aggregatedSections.push(
        `${STRUCTURED_CONTENT_LLM.SECTION_PLANNING}\n\n${planRaw}`,
      )
    }
    if (toolExecutionContent) {
      aggregatedSections.push(
        `${STRUCTURED_CONTENT_LLM.SECTION_SKILLS_TOOL}\n\n${toolExecutionContent}`,
      )
    }
    if (runSummary) {
      aggregatedSections.push(
        `${STRUCTURED_CONTENT_LLM.SECTION_SUMMARY}\n\n${runSummary}`,
      )
    }
    if (report) {
      aggregatedSections.push(
        `${STRUCTURED_CONTENT_LLM.SECTION_REPORT}\n\n${report}`,
      )
    } else if (createPaperDigest) {
      aggregatedSections.push(
        `${STRUCTURED_CONTENT_LLM.SECTION_RESEARCH_REPORT}\n\n${createPaperDigest}`,
      )
    }

    const aggregatedFinal = aggregatedSections
      .join(STRUCTURED_CONTENT_LLM.SECTION_SEPARATOR)
      .trim()

    const legacyFallback =
      directAnswerResponse ||
      finalGoalResult ||
      report ||
      createPaperDigest ||
      skillsOutput ||
      toolOutput ||
      runSummary ||
      thinkingRaw ||
      ''

    const finalResult = aggregatedFinal || legacyFallback

    const researchReport = buildResearchReportRef(this.outputStore)
    const pipelineConversation = buildPipelineConversationTurns(this)

    const allArtifactPaths = uniqueStrings([
      ...planningRefPaths,
      ...collectSandboxArtifactPaths(this.sandbox),
      ...stepCaptures.flatMap((s) => s.outputPaths),
      ...(researchReport ? [researchReport.pdfPath] : []),
    ])

    const outputRoot = this.sandbox.getRoot()
      ? sandboxOutputDir(this.sandbox.getRoot()!)
      : undefined

    for (let i = 0; i < stepCaptures.length; i++) {
      const capture = stepCaptures[i]!
      const stageId = flowStageIdForStepCapture(capture.stepType)
      const attachments = stageId
        ? this.getAggregatedAttachmentsForStage(stageId)
        : []
      const pathLinks = buildOutputLinksFromPaths(capture.outputPaths, {
        restrictToDir: outputRoot,
      })
      const pathAttachments: StepAttachment[] = []
      for (const link of pathLinks) {
        let absPath = link.url
        try {
          absPath = fileURLToPath(link.url)
        } catch {
          /* keep url as path fallback */
        }
        pathAttachments.push({
          path: absPath,
          label: link.label,
          url: link.url,
        })
      }
      const merged = dedupeStepAttachments([...attachments, ...pathAttachments])
      if (merged.length > 0) {
        capture.attachments = merged
      }
    }

    const structuredContent: AssistantStructuredContent = {
      version: 2,
      assistantContent: {
        outer: {
          finalResult,
          report,
          stepCaptures: stepCaptures.length > 0 ? stepCaptures : undefined,
          allArtifactPaths:
            allArtifactPaths.length > 0 ? allArtifactPaths : undefined,
          ...(researchReport ? { researchReport } : {}),
          ...(pipelineConversation.length > 0 ? { pipelineConversation } : {}),
        },
        subSteps,
      },
    }

    return limitMessageContentForPersistence(
      JSON.stringify(structuredContent),
      'assistant',
    )
  }

  /** Completed steps in pipeline order (for persistence / reload). */
  listCompletedStepsForPersistence(): AgentStepSnapshot[] {
    return this.getOrderedStepContexts().filter((step) =>
      Boolean(step.completedAt),
    )
  }

  getStepProgressText(stepKey: string): string {
    return this.stepProgressTextByKey.get(stepKey) ?? ''
  }

  getStepAttachments(stepKey: string): StepAttachment[] {
    return [...(this.stepAttachmentsByKey.get(stepKey) ?? [])]
  }

  /** Output files produced by the latest completed tool-loop run for a todo. */
  getToolLoopAttachmentsForTodo(todoId: number): StepAttachment[] {
    const steps = this.getOrderedStepContexts().filter(
      (s) =>
        s.stepId === TOOL_LOOP_STEP_ID &&
        Boolean(s.completedAt) &&
        s.meta?.todoId === todoId,
    )
    if (steps.length === 0) return []
    return this.getStepAttachments(steps[steps.length - 1]!.key)
  }

  appendStepAttachments(stepKey: string, items: readonly StepAttachment[]): void {
    if (!items.length) return
    const merged = mergeStepAttachments(
      this.stepAttachmentsByKey.get(stepKey) ?? [],
      items,
    )
    this.stepAttachmentsByKey.set(stepKey, merged)
  }

  /** Union tool-loop attachments (includes per-todo child runs) for structured captures. */
  getAggregatedAttachmentsForStage(stageId: FlowStageId): StepAttachment[] {
    if (stageId === TOOL_LOOP_STEP_ID || stageId === SKILLS_STEP_ID) {
      let merged: StepAttachment[] = []
      for (const step of this.stepHistory) {
        if (step.stepId !== TOOL_LOOP_STEP_ID) continue
        merged = mergeStepAttachments(
          merged,
          this.getStepAttachments(step.key),
        )
      }
      return merged
    }
    let merged: StepAttachment[] = []
    for (const step of this.stepHistory) {
      if (step.stepId !== stageId) continue
      merged = mergeStepAttachments(merged, this.getStepAttachments(step.key))
    }
    return merged
  }

  mergeToolLoopAttachmentsIntoParent(parentStepKey: string): void {
    const parent = this.stepHistory.find((s) => s.key === parentStepKey)
    if (!parent) return

    let merged = this.getStepAttachments(parentStepKey)

    for (const step of this.stepHistory) {
      if (step.stepId !== TOOL_LOOP_STEP_ID) continue
      if (step.key === parentStepKey) continue
      merged = mergeStepAttachments(merged, this.getStepAttachments(step.key))
      merged = this.appendScanLinksToAttachments(
        merged,
        collectOutputLinksForStep(step, this.sandbox, this.references),
      )
    }

    merged = this.appendScanLinksToAttachments(
      merged,
      collectOutputLinksForStep(parent, this.sandbox, this.references),
    )

    if (merged.length === 0) return
    this.stepAttachmentsByKey.set(parentStepKey, merged)
    this.publishStepProgress(parent)
  }

  private appendScanLinksToAttachments(
    attachments: readonly StepAttachment[],
    scanLinks: Array<{ label: string; url: string }>,
  ): StepAttachment[] {
    let merged = [...attachments]
    const seenPaths = new Set(
      merged.map((a) => a.path.replace(/\\/g, '/').toLowerCase()),
    )
    for (const link of scanLinks) {
      let absPath: string | undefined
      try {
        absPath = fileURLToPath(link.url)
      } catch {
        continue
      }
      const key = absPath.replace(/\\/g, '/').toLowerCase()
      if (seenPaths.has(key)) continue
      seenPaths.add(key)
      merged = mergeStepAttachments(merged, [
        {
          path: absPath,
          label: link.label,
          url: link.url,
        },
      ])
    }
    return dedupeStepAttachments(merged)
  }

  private mergeAttachmentsWithScanLinks(
    stepContext: AgentStepSnapshot,
    scanLinks: Array<{ label: string; url: string }>,
  ): StepAttachment[] {
    const attachments = this.getStepAttachments(stepContext.key)
    return this.appendScanLinksToAttachments(attachments, scanLinks)
  }

  getStepContext(stepId: AgentStepId): AgentStepSnapshot | undefined {
    return this.stepContexts[stepId]
  }

  getPreviousStepContext(stepId: AgentStepId): AgentStepSnapshot | undefined {
    const current = this.stepContexts[stepId]
    if (!current?.previousStepKey) return undefined
    return this.stepHistory.find((step) => step.key === current.previousStepKey)
  }

  beginStep(
    stepId: AgentStepId,
    title: string,
    meta?: Record<string, unknown>,
    instanceKey?: string,
    goal?: string,
    summary?: string,
  ): AgentStepSnapshot {
    let stepContext = instanceKey
      ? this.stepHistory.find((step) => step.key === instanceKey)
      : undefined
    if (!stepContext) {
      const previousStepContext = this.getLatestCompletedStepContext()
      const localKey = instanceKey ?? `${stepId}:${this.nextStepSequence}`
      stepContext = {
        key: ensureScopedStepKey(this.flowId, localKey),
        stepId,
        title,
        sequence: this.nextStepSequence++,
        startedAt: new Date().toISOString(),
        inputMessages: [...this.currentMessages],
        previousStepKey: previousStepContext?.key,
        previousStepId: previousStepContext?.stepId,
        previousOutput: previousStepContext?.output,
        ...(goal ? { goal } : {}),
        ...(summary ? { summary } : {}),
        ...(meta ? { meta: { ...meta } } : {}),
      }
      this.stepHistory.push(stepContext)
    }
    stepContext.title = title
    stepContext.inputMessages = [...this.currentMessages]
    if (goal) stepContext.goal = goal
    if (summary) stepContext.summary = summary
    if (meta) {
      stepContext.meta = {
        ...(stepContext.meta ?? {}),
        ...meta,
      }
    }
    if (this.shouldRegisterToolLoopStepContext(stepId, title, meta)) {
      this.stepContexts[stepId] = stepContext
    }
    this.publishStepProgress(stepContext)
    return stepContext
  }

  recordStepOutput(
    stepId: AgentStepId,
    title: string,
    output: unknown,
    renderedOutput?: string,
    meta?: Record<string, unknown>,
    instanceKey?: string,
    goal?: string,
    summary?: string,
  ): AgentStepSnapshot {
    const stepContext = this.beginStep(
      stepId,
      title,
      meta,
      instanceKey,
      goal,
      summary,
    )
    stepContext.output = output
    stepContext.renderedOutput = renderedOutput
    stepContext.completedAt = new Date().toISOString()
    this.rebuildStepOutputsFromHistory()

    if (output != null && stepId !== COLLECT_FORM_STEP_ID) {
      const data: StepData =
        typeof output === 'string'
          ? ({ text: output, rendered: renderedOutput } as StepData & {
              text: string
            })
          : ({ ...(output as object), rendered: renderedOutput } as StepData)
      this.outputStore.push({
        stepId: stepId as FlowStageId,
        instanceKey: stepContext.key,
        data,
        timestamp: stepContext.completedAt,
      } as StepOutputEntry)
    }
    const rendered = renderedOutput?.trim()
    if (rendered) {
      this.stepProgressTextByKey.set(
        stepContext.key,
        limitPersistedStepText(rendered),
      )
    }
    const scanLinks = collectOutputLinksForStep(
      stepContext,
      this.sandbox,
      this.references,
    )
    const attachments = this.mergeAttachmentsWithScanLinks(
      stepContext,
      scanLinks,
    )
    if (attachments.length > 0) {
      this.stepAttachmentsByKey.set(stepContext.key, attachments)
    }
    this.publishStepProgress(stepContext)
    return stepContext
  }

  updateStepOutput(
    stepId: AgentStepId,
    title: string,
    output: unknown,
    renderedOutput?: string,
    meta?: Record<string, unknown>,
    instanceKey?: string,
    goal?: string,
    summary?: string,
  ): AgentStepSnapshot {
    return this.recordStepOutput(
      stepId,
      title,
      output,
      renderedOutput,
      meta,
      instanceKey,
      goal,
      summary,
    )
  }

  getStepOutput<T = unknown>(stepId: AgentStepId): T | undefined {
    const key = STEP_OUTPUT_KEY_BY_ID[stepId]
    if (key && this.stepOutputs[key] !== undefined) {
      return this.stepOutputs[key] as T
    }
    return this.stepContexts[stepId]?.output as T | undefined
  }

  getCompletedStepHistoryBefore(instanceKey?: string): AgentStepSnapshot[] {
    const current = instanceKey
      ? this.stepHistory.find((step) => step.key === instanceKey)
      : undefined
    return this.getOrderedStepContexts().filter(
      (stepContext) =>
        Boolean(stepContext.completedAt) &&
        stepContext.key !== instanceKey &&
        stepContext.stepId !== COLLECT_FORM_STEP_ID &&
        (current ? stepContext.sequence < current.sequence : true),
    )
  }

  getPreviousStepContextByKey(
    instanceKey?: string,
  ): AgentStepSnapshot | undefined {
    if (!instanceKey) return undefined
    const current = this.stepHistory.find((step) => step.key === instanceKey)
    if (!current?.previousStepKey) return undefined
    return this.stepHistory.find((step) => step.key === current.previousStepKey)
  }

  private getOrderedStepContexts(): AgentStepSnapshot[] {
    return [...this.stepHistory].sort(
      (left, right) => left.sequence - right.sequence,
    )
  }

  private getLatestCompletedStepContext(): AgentStepSnapshot | undefined {
    return [...this.getOrderedStepContexts()]
      .reverse()
      .find((stepContext) => Boolean(stepContext.completedAt))
  }

  private rebuildCurrentMessagesFromStepContexts() {
    const assistantTurns = this.getOrderedStepContexts()
      .filter((stepContext) => stepContext.stepId !== COLLECT_FORM_STEP_ID)
      .map((stepContext) => stepContext.renderedOutput?.trim() ?? '')
      .filter(Boolean)
      .map((content) => ({ role: 'assistant' as const, content }))

    this.currentMessages = [...this.opts.messages, ...assistantTurns]
  }

  private getCompletedStepsForId(stepId: AgentStepId): AgentStepSnapshot[] {
    return this.getOrderedStepContexts().filter(
      (s) => s.stepId === stepId && Boolean(s.completedAt),
    )
  }

  private formatCompletedStepSegment(step: AgentStepSnapshot): string {
    const body = formatAgentStepOutputBody(step)
    const summary = step.summary?.trim()
    const parts: string[] = []
    if (step.title?.trim()) parts.push(`**${step.title.trim()}**`)
    if (step.goal?.trim()) parts.push(`**Goal:**\n${step.goal.trim()}`)
    if (summary) parts.push(`**Summary:**\n${summary}`)
    if (body) parts.push(body)
    return parts.join('\n\n').trim()
  }

  private aggregateStringOutputsFromHistory(stepId: AgentStepId): string {
    if (stepId === TOOL_LOOP_STEP_ID) {
      const digest = this.buildToolLoopOutputDigest()
      if (digest) return digest
    }
    return this.getCompletedStepsForId(stepId)
      .filter((s) => s.meta?.pendingApproval !== true)
      .map((s) => this.formatCompletedStepSegment(s))
      .filter(Boolean)
      .join('\n\n---\n\n')
  }

  /** Completed tool-loop rows excluding HITL pause snapshots. */
  private getToolLoopStepsForDigest(): AgentStepSnapshot[] {
    return this.getCompletedStepsForId(TOOL_LOOP_STEP_ID).filter(
      (s) => s.meta?.pendingApproval !== true,
    )
  }

  private isBatchToolLoopRollupStep(step: AgentStepSnapshot): boolean {
    return (
      isAgenticRunParentStepTitle(step.title) &&
      typeof step.meta?.todoId !== 'number'
    )
  }

  private latestToolLoopStepByTodoId(
    steps: AgentStepSnapshot[],
  ): Map<number, AgentStepSnapshot> {
    const byTodo = new Map<number, AgentStepSnapshot>()
    for (const s of steps) {
      const todoId = s.meta?.todoId
      if (typeof todoId !== 'number' || !Number.isFinite(todoId)) continue
      const prev = byTodo.get(todoId)
      if (!prev || s.sequence > prev.sequence) {
        byTodo.set(todoId, s)
      }
    }
    return byTodo
  }

  /**
   * Planned-task outline for summary/report (status + output excerpt from plan state).
   */
  formatPlannedTasksOutlineForSummary(): string {
    const planData =
      this.outputStore.latest<import('./steps/step-io').PlanningStepData>(
        PLANNING_STEP_ID,
      )
    const todos =
      planData?.todoList ?? this.stepOutputs.planning?.todoList ?? []
    if (todos.length === 0) return ''
    return todos
      .map((t) => {
        const head = `- Task ${t.id} [${t.status}]: ${t.name?.trim() || '(unnamed)'}`
        const desc = t.description?.trim()
        const criteria = t.success_criteria?.trim()
        const lines = [head]
        if (desc) lines.push(`  Description: ${desc}`)
        if (criteria) lines.push(`  Success criteria: ${criteria}`)
        return lines.join('\n')
      })
      .join('\n')
  }

  /**
   * Ordered per-todo execution material for summary/report (stable under HITL resumes).
   */
  formatOrderedExecutionForSummary(): {
    toolExecution: string
    skillsFallback: string
  } {
    const planData =
      this.outputStore.latest<import('./steps/step-io').PlanningStepData>(
        PLANNING_STEP_ID,
      )
    const plan = this.stepOutputs.planning
    const todos = planData?.todoList ?? plan?.todoList ?? []
    const steps = this.getToolLoopStepsForDigest()
    const byTodoId = this.latestToolLoopStepByTodoId(steps)
    const hasPerTodoSteps = byTodoId.size > 0

    const sections: string[] = []

    if (todos.length > 0) {
      for (const t of todos) {
        const step = byTodoId.get(t.id)
        const header = STRUCTURED_CONTENT_LLM.TASK_HEADER.replace(
          '{id}',
          String(t.id),
        )
          .replace(
            '{name}',
            t.name?.trim() || STRUCTURED_CONTENT_LLM.TASK_UNNAMED,
          )
          .replace('{status}', t.status)
        if (step) {
          const body = this.formatCompletedStepSegment(step)
          sections.push(body ? `${header}\n\n${body}` : header)
          continue
        }
        const out = t.output?.trim()
        if (!out) {
          sections.push(
            `${header}\n\n(No tool-loop step output recorded for this task.)`,
          )
        }
      }
    } else if (hasPerTodoSteps) {
      const ordered = [...byTodoId.entries()].sort(([a], [b]) => a - b)
      for (const [, step] of ordered) {
        const seg = this.formatCompletedStepSegment(step)
        if (seg) sections.push(seg)
      }
    }

    if (sections.length === 0) {
      const fallback = steps
        .filter((s) => !hasPerTodoSteps || !this.isBatchToolLoopRollupStep(s))
        .map((s) => this.formatCompletedStepSegment(s))
        .filter(Boolean)
        .join('\n\n---\n\n')
      return { toolExecution: fallback, skillsFallback: '' }
    }

    return { toolExecution: sections.join('\n\n---\n\n'), skillsFallback: '' }
  }

  /** Canonical tool-loop digest for {@link stepOutputs} and downstream steps. */
  buildToolLoopOutputDigest(): string {
    const { toolExecution } = this.formatOrderedExecutionForSummary()
    if (toolExecution.trim()) return toolExecution.trim()
    return this.getToolLoopStepsForDigest()
      .filter((s) => !this.isBatchToolLoopRollupStep(s))
      .map((s) => this.formatCompletedStepSegment(s))
      .filter(Boolean)
      .join('\n\n---\n\n')
  }

  private latestStructuredOutputFromHistory<T>(
    stepId: AgentStepId,
  ): T | undefined {
    const steps = this.getCompletedStepsForId(stepId)
    if (steps.length === 0) return undefined
    return steps[steps.length - 1]!.output as T
  }

  /**
   * Rebuilds {@link stepOutputs} from every completed row in {@link stepHistory}
   * so multiple runs of the same stepId (todos, retries, approval resume) are all
   * visible to summary, report, and structured content builders.
   */
  rebuildStepOutputsFromHistory(): void {
    const next: StepOutputs = {}

    const thinking =
      this.latestStructuredOutputFromHistory<ThinkingResult>(THINKING_STEP_ID)
    if (thinking) next.thinking = thinking

    const planning =
      this.latestStructuredOutputFromHistory<PlanningResult>(PLANNING_STEP_ID)
    if (planning) next.planning = planning

    const skills = this.aggregateStringOutputsFromHistory(SKILLS_STEP_ID)
    if (skills) next.skills = skills

    const toolLoop = this.aggregateStringOutputsFromHistory(TOOL_LOOP_STEP_ID)
    if (toolLoop) next.toolLoop = toolLoop

    let summary =
      this.latestStructuredOutputFromHistory<SummaryResult>(SUMMARY_STEP_ID)
    if (!summary) {
      const legacy = this.latestStructuredOutputFromHistory<{
        summary?: string
        reason?: string
      }>('analysis' as AgentStepId)
      const legacyText = legacy?.summary?.trim() || legacy?.reason?.trim() || ''
      if (legacyText) {
        summary = {
          summary: legacyText,
          goalAchieved: false,
          waysToAchieveGoalBetter: '',
          shouldMemorize: false,
          memorizeReason: '',
        }
      }
    }
    if (summary) next.summary = summary

    const reportSteps = this.getCompletedStepsForId(REPORT_STEP_ID)
    const lastReport = reportSteps[reportSteps.length - 1]
    const report = lastReport
      ? (lastReport.renderedOutput?.trim() ??
        (typeof lastReport.output === 'string' ? lastReport.output.trim() : ''))
      : ''
    if (report) next.report = report

    const prompt = this.aggregateStringOutputsFromHistory(PROMPT_STEP_ID)
    if (prompt) next.prompt = prompt

    this.stepOutputs = next
  }

  /** Rebuilds the generic output store from step history (used after restore). */
  private rebuildOutputStoreFromHistory(): void {
    this.outputStore.clear()
    for (const step of this.getOrderedStepContexts()) {
      if (!step.completedAt || !step.output) continue
      if (step.stepId === COLLECT_FORM_STEP_ID) continue
      const data: StepData =
        typeof step.output === 'string'
          ? ({
              text: step.output,
              rendered: step.renderedOutput,
            } as StepData & { text: string })
          : ({
              ...(step.output as object),
              rendered: step.renderedOutput,
            } as StepData)
      this.outputStore.push({
        stepId: step.stepId as FlowStageId,
        instanceKey: step.key,
        data,
        timestamp: step.completedAt,
      } as StepOutputEntry)
    }
  }

  emitStepProgress(
    chunk: string,
    stepId?: AgentStepId,
    instanceKey?: string,
  ): void {
    if (!chunk) return
    let target = instanceKey
      ? this.stepHistory.find((step) => step.key === instanceKey)
      : stepId
        ? this.stepContexts[stepId] ??
          this.stepHistory.find((step) => step.stepId === stepId)
        : this.getLatestStepContext()
    if (!target || !this.opts.onStepProgress) {
      if (this.opts.onStepProgress && this.stepHistory.length > 0) {
        target = this.getLatestStepContext()
      }
    }
    if (!target || !this.opts.onStepProgress) {
      this.opts.onChunk(chunk)
      return
    }
    const next = limitPersistedStepText(
      (this.stepProgressTextByKey.get(target.key) ?? '') + chunk,
    )
    this.stepProgressTextByKey.set(target.key, next)
    const publishTarget = this.resolvePublishStepProgressTarget(target, chunk)
    if (!publishTarget) return
    this.publishStepProgress(publishTarget)
  }

  /**
   * Per-todo tool-loop steps are not streamed directly; mirror their progress
   * onto the batch parent so live IPC/UI updates stay visible.
   */
  private resolvePublishStepProgressTarget(
    stepContext: AgentStepSnapshot,
    chunk: string,
  ): AgentStepSnapshot | null {
    if (this.shouldPublishStepProgress(stepContext)) return stepContext
    const parent = this.stepContexts[TOOL_LOOP_STEP_ID]
    if (!parent || parent.key === stepContext.key) return null
    if (!this.shouldPublishStepProgress(parent)) return null
    const parentNext = limitPersistedStepText(
      (this.stepProgressTextByKey.get(parent.key) ?? '') + chunk,
    )
    this.stepProgressTextByKey.set(parent.key, parentNext)
    return parent
  }

  private getLatestStepContext(): AgentStepSnapshot | undefined {
    return [...this.stepHistory].sort((a, b) => b.sequence - a.sequence)[0]
  }

  private buildStepProgressPayload(
    stepContext: AgentStepSnapshot,
  ): AgentStepProgressPayload {
    const attachments = this.getStepAttachments(stepContext.key)
    const runScope = getCurrentAgentRunScope()
    const flowId = runScope?.runId ?? this.flowId
    return {
      stepKey: stepContext.key,
      stepId: stepContext.stepId,
      title: stepContext.title,
      sequence: stepContext.sequence,
      content: this.stepProgressTextByKey.get(stepContext.key) ?? '',
      status: stepContext.completedAt ? 'completed' : 'running',
      goal: stepContext.goal,
      summary: stepContext.summary,
      ...(attachments.length ? { attachments } : {}),
      ...(flowId ? { runId: flowId, flowId } : {}),
      ...(runScope?.parentRunId ? { parentRunId: runScope.parentRunId } : {}),
      ...(this.lastHitlPausedStageId
        ? { scopedStageId: this.lastHitlPausedStageId }
        : {}),
    }
  }

  private isPerTaskToolLoopStep(step: AgentStepSnapshot): boolean {
    if (step.stepId !== TOOL_LOOP_STEP_ID) return false
    if (step.meta?.suppressToolLoopUi === true) return true
    if (typeof step.meta?.todoId === 'number') return true
    return isAgenticRunPerTaskStepTitle(step.title)
  }

  /** Only the batch parent agentic-run row is streamed; per-todo attempts stay internal. */
  private shouldRegisterToolLoopStepContext(
    stepId: AgentStepId,
    title: string,
    meta?: Record<string, unknown>,
  ): boolean {
    if (stepId !== TOOL_LOOP_STEP_ID) return true
    if (meta?.suppressToolLoopUi === true) return false
    if (typeof meta?.todoId === 'number') return false
    return title.trim() === TOOL_LOOP_STEP_TITLE
  }

  /** Per-todo foreach shells (title = task name); orchestration stays on the parent Agentic Run stream. */
  private isPerTaskForeachItemStep(step: AgentStepSnapshot): boolean {
    return (
      step.stepId === FOREACH_ITEM_STEP_ID &&
      typeof step.meta?.todoId === 'number'
    )
  }

  private shouldPublishStepProgress(stepContext: AgentStepSnapshot): boolean {
    if (this.isPerTaskForeachItemStep(stepContext)) return false
    if (this.isPerTaskToolLoopStep(stepContext)) return false
    const parentKey = this.stepContexts[TOOL_LOOP_STEP_ID]?.key
    if (
      stepContext.stepId === TOOL_LOOP_STEP_ID &&
      parentKey &&
      stepContext.key !== parentKey
    ) {
      return false
    }
    return true
  }

  private publishStepProgress(stepContext: AgentStepSnapshot): void {
    if (!this.shouldPublishStepProgress(stepContext)) return
    this.opts.onStepProgress?.(this.buildStepProgressPayload(stepContext))
  }
}

export class AgentStepContext {
  constructor(
    protected readonly flowContext: AgentFlowContext,
    public readonly stepId: AgentStepId,
    public readonly title: string,
    private readonly instanceKey: string,
    public readonly flowStepConfig?: FlowStepConfig,
  ) {}

  /** Unique key for this step run (used as `output/toolLoop/<key>/` scope). */
  get stepInstanceKey(): string {
    return this.instanceKey
  }

  get opts() {
    return this.flowContext.opts
  }

  get model() {
    return this.flowContext.model
  }

  resolveStageModel(stage: AgentLlmStage): unknown {
    return this.flowContext.resolveStageModel(stage)
  }

  resolveStageChoice(stage: AgentLlmStage) {
    return this.flowContext.resolveStageChoice(stage)
  }

  resolveToolLoopExecutionChoice(isRecoveryAttempt: boolean) {
    return this.flowContext.resolveToolLoopExecutionChoice(isRecoveryAttempt)
  }

  resolveToolLoopExecutionModel(isRecoveryAttempt: boolean): unknown {
    return this.flowContext.resolveToolLoopExecutionModel(isRecoveryAttempt)
  }

  get executionSteps() {
    return this.flowContext.executionSteps
  }

  get agentRun() {
    return this.flowContext.agentRun
  }

  /** Alias for {@link AgentFlowContext} used by step orchestrators. */
  get agentFlow(): AgentFlowContext {
    return this.flowContext
  }

  getToolLoopAttachmentsForTodo(todoId: number): StepAttachment[] {
    return this.flowContext.getToolLoopAttachmentsForTodo(todoId)
  }

  get currentMessages() {
    return this.flowContext.currentMessages
  }

  get stepOutputs() {
    return this.flowContext.stepOutputs
  }

  get outputStore(): StepOutputStore {
    return this.flowContext.outputStore
  }

  get stepContexts() {
    return this.flowContext.stepContextState
  }

  get stepHistory() {
    return this.flowContext.stepHistoryState
  }

  get skillsOutput() {
    return this.flowContext.skillsOutput
  }

  get skillId() {
    return this.flowContext.skillId
  }

  get runtimeTools() {
    return this.flowContext.runtimeTools
  }

  get config() {
    return this.flowContext.config
  }

  get providers() {
    return this.flowContext.providers
  }

  get references() {
    return this.flowContext.references
  }

  get sandbox() {
    return this.flowContext.sandbox
  }

  get form() {
    return this.flowContext.form
  }

  get validationSchema() {
    return this.flowContext.validationSchema
  }

  get collectedFormByTodoId() {
    return this.flowContext.collectedFormByTodoId
  }

  set collectedFormByTodoId(value) {
    this.flowContext.collectedFormByTodoId = value
  }

  get generatedFormSchemaByTodoId() {
    return this.flowContext.generatedFormSchemaByTodoId
  }

  get approvalResumeTodoIndex() {
    return this.flowContext.approvalResumeTodoIndex
  }

  set approvalResumeTodoIndex(value: number | undefined) {
    this.flowContext.approvalResumeTodoIndex = value
  }

  get hitlAwaitingApproval() {
    return this.flowContext.hitlAwaitingApproval
  }

  set hitlAwaitingApproval(value) {
    this.flowContext.hitlAwaitingApproval = value
  }

  get hitlAwaitingFormData() {
    return this.flowContext.hitlAwaitingFormData
  }

  set hitlAwaitingFormData(value) {
    this.flowContext.hitlAwaitingFormData = value
  }

  get hitlAwaitingManualIntervention() {
    return this.flowContext.hitlAwaitingManualIntervention
  }

  set hitlAwaitingManualIntervention(value) {
    this.flowContext.hitlAwaitingManualIntervention = value
  }

  get flowId(): string {
    return this.flowContext.flowId
  }

  get lastHitlPausedStageId(): string | undefined {
    return this.flowContext.lastHitlPausedStageId
  }

  set lastHitlPausedStageId(value: string | undefined) {
    this.flowContext.lastHitlPausedStageId = value
  }

  setHitlPausedAtStage(stageId: FlowStageId): void {
    this.flowContext.setHitlPausedAtStage(stageId)
  }

  get resumeTodoIndex(): number | undefined {
    return this.flowContext.resumeTodoIndex
  }

  set resumeTodoIndex(value: number | undefined) {
    this.flowContext.resumeTodoIndex = value
  }

  get todoRecoveryAttempt(): boolean {
    return this.flowContext.todoRecoveryAttempt
  }

  set todoRecoveryAttempt(value: boolean) {
    this.flowContext.todoRecoveryAttempt = value
  }

  getCachedMarkdownReferenceBody(key: string): string | undefined {
    return this.flowContext.markdownReferenceBodyByKey.get(key)
  }

  cacheMarkdownReferenceBody(key: string, body: string): void {
    this.flowContext.markdownReferenceBodyByKey.set(key, body)
  }

  getLatestUserMessageContent(): string {
    return this.flowContext.getLatestUserMessageContent()
  }

  buildPipelineContextMessages(
    opts: PipelineContextMessageOptions = {},
  ): AgentMessage[] {
    return this.flowContext.buildPipelineContextMessages(opts)
  }

  rebuildStepOutputsFromHistory(): void {
    this.flowContext.rebuildStepOutputsFromHistory()
  }

  buildToolLoopOutputDigest(): string {
    return this.flowContext.buildToolLoopOutputDigest()
  }

  appendAssistantTurn(content: string) {
    this.flowContext.appendAssistantTurn(content)
  }

  appendAssistantMessage(content: string) {
    this.flowContext.appendAssistantMessage(content)
  }

  emitStepProgress(chunk: string, stepId: AgentStepId = this.stepId) {
    this.flowContext.emitStepProgress(chunk, stepId, this.instanceKey)
  }

  /** Stream tool-loop text to the batch parent section (not per-todo child keys). */
  emitBatchToolLoopStepProgress(chunk: string): void {
    if (!chunk) return
    this.flowContext.emitStepProgress(chunk, TOOL_LOOP_STEP_ID)
  }

  beginStep(
    stepId: AgentStepId = this.stepId,
    title: string = this.title,
    meta?: Record<string, unknown>,
    goal?: string,
    summary?: string,
  ) {
    const mergedMeta =
      stepId === TOOL_LOOP_STEP_ID
        ? {
            ...meta,
            toolLoopOutputRelDir: this.sandbox.toolLoopOutputRelBase(
              this.instanceKey,
            ),
          }
        : meta
    const snap = this.flowContext.beginStep(
      stepId,
      title,
      mergedMeta,
      this.instanceKey,
      goal,
      summary,
    )
    if (stepId === TOOL_LOOP_STEP_ID && this.sandbox.planning) {
      this.sandbox.activateToolLoopOutputScope(
        toolLoopFilesystemScopeFromStepKey(this.instanceKey),
      )
    }
    return snap
  }

  clearToolLoopOutputScope(): void {
    this.sandbox.clearToolLoopOutputScope()
  }

  /**
   * Bind sandbox root + workspace path + optional tool-loop scope before executing a skill tool.
   * Called from {@link step-helpers} on every tool invocation; {@link AgentRun} also calls
   * {@link SandboxContext.syncWorkspaceToTools} at run start so globals are set before the first tool.
   */
  syncSandboxForToolExecution(toolLoopScope?: string): void {
    this.sandbox.syncBindingToTools()
    this.sandbox.syncWorkspaceToTools()
    const scope = toolLoopFilesystemScopeFromStepKey(toolLoopScope ?? '')
    if (!scope) return
    this.sandbox.activateToolLoopOutputScope(scope)
  }

  recordStepOutput(
    stepId: AgentStepId = this.stepId,
    title: string = this.title,
    output?: unknown,
    renderedOutput?: string,
    meta?: Record<string, unknown>,
    goal?: string,
    summary?: string,
  ) {
    return this.flowContext.recordStepOutput(
      stepId,
      title,
      output,
      renderedOutput,
      meta,
      this.instanceKey,
      goal,
      summary,
    )
  }

  updateStepOutput(
    stepId: AgentStepId = this.stepId,
    title: string = this.title,
    output?: unknown,
    renderedOutput?: string,
    meta?: Record<string, unknown>,
    goal?: string,
    summary?: string,
  ) {
    return this.flowContext.updateStepOutput(
      stepId,
      title,
      output,
      renderedOutput,
      meta,
      this.instanceKey,
      goal,
      summary,
    )
  }

  getStepOutput<T = unknown>(stepId: AgentStepId): T | undefined {
    return this.flowContext.getStepOutput<T>(stepId)
  }

  getStepContext(stepId: AgentStepId) {
    return this.flowContext.getStepContext(stepId)
  }

  getPreviousStepContext(stepId: AgentStepId = this.stepId) {
    if (stepId !== this.stepId) {
      return this.flowContext.getPreviousStepContext(stepId)
    }
    return this.flowContext.getPreviousStepContextByKey(this.instanceKey)
  }

  getCompletedStepHistory() {
    return this.flowContext.getCompletedStepHistoryBefore(this.instanceKey)
  }

  getCompletedToolSkillStepHistory() {
    return this.getCompletedStepHistory().filter(
      (step) =>
        step.stepId === TOOL_LOOP_STEP_ID &&
        typeof step.meta?.todoId === 'number',
    )
  }

  renderPreviousStepContextBlock(): string {
    const previousSteps = this.getCompletedStepHistory()
    if (previousSteps.length === 0) return ''
    const sections = previousSteps.map((step) => {
      const parts = [`[${step.sequence}] ${step.title}`]
      if (step.goal?.trim()) {
        parts.push(`Goal:\n${step.goal.trim()}`)
      }
      if (step.summary?.trim()) {
        parts.push(`Summary:\n${step.summary.trim()}`)
      }
      const outputText = formatAgentStepOutputBody(step)
      if (outputText) {
        parts.push(`Output:\n${outputText}`)
      }
      return parts.join('\n\n')
    })
    return `=== PREVIOUS STEP CONTEXT (ORDERED OLDEST TO NEWEST) ===\n${sections.join('\n\n---\n\n')}`
  }

  renderPreviousToolSkillStepBlock(): string {
    const previousSteps = this.getCompletedToolSkillStepHistory()
    if (previousSteps.length === 0) return ''
    return this.formatPreviousToolSkillStepsBlock(previousSteps)
  }

  /**
   * Short prior-todo context for multi-step plans (avoids duplicating full tool dumps
   * already present in a sliced approval UI thread).
   */
  renderPreviousToolSkillStepsSummary(beforeTodoId: number): string {
    const previousSteps = this.getCompletedToolSkillStepHistory().filter(
      (step) =>
        typeof step.meta?.todoId === 'number' &&
        Number.isFinite(step.meta.todoId) &&
        step.meta.todoId < beforeTodoId,
    )
    if (previousSteps.length === 0) return ''
    return this.formatPreviousToolSkillStepsBlock(previousSteps, {
      maxResultChars: 1200,
    })
  }

  private formatPreviousToolSkillStepsBlock(
    previousSteps: AgentStepSnapshot[],
    opts?: { maxResultChars?: number },
  ): string {
    const maxChars = opts?.maxResultChars
    const items = previousSteps.map((step, index) => {
      const todoId =
        typeof step.meta?.todoId === 'number' ? step.meta.todoId : index + 1
      const goalText = step.goal?.trim() || '(missing goal)'
      let resultText =
        step.summary?.trim() || formatAgentStepOutputBody(step)
      if (maxChars && resultText.length > maxChars) {
        resultText = `${resultText.slice(0, maxChars)}\n…[truncated]`
      }

      return [
        `Task ${todoId} — Goal:`,
        goalText,
        '',
        `Task ${todoId} — Result:`,
        resultText || '(missing result)',
      ].join('\n')
    })

    return `=== PREVIOUS TOOL SKILL STEPS (ORDERED OLDEST TO NEWEST) ===\n${items.join('\n\n')}\n\n === END OF PREVIOUS TOOL SKILL STEPS ===`
  }

  createStepContext(
    stepId: AgentStepId,
    title: string,
    flowStepConfig?: FlowStepConfig,
  ): AgentStepContext {
    return this.flowContext.createStepContext(
      stepId,
      title,
      flowStepConfig ?? this.flowStepConfig,
    )
  }

  requestPipelineGoto(stageId: FlowStageId): void {
    this.flowContext.requestPipelineGoto(stageId)
  }
}
