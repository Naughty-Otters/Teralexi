import { z } from 'zod'
import type {
  AgentResponseOpts,
  AgentMessage,
  AgentStepContext as AgentStepSnapshot,
  AgentStepContextHistory,
  AgentStepContextMap,
  AgentStepId,
  StepOutputs,
  RuntimeToolMeta,
  ThinkingResult,
  PlanningResult,
  SummaryResult,
  SkillChainPlan,
} from './types'
import type { ParsedCollectFormSchema } from './form/schema'
import type { ResearchResumeState } from './steps/research/config'
import type { AgentLlmStage } from '@shared/agent/stage-llm-settings'
import { limitPersistedStepText } from '@shared/persistence/limit-persisted-content'
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
import { ProviderContext } from './providers/context'
import { SandboxContext } from './sandbox/context'
import {
  setAgentRunAssistantMessageId,
  setAgentRunConversationId,
} from './sandbox/run-context'
import { collectOutputLinksForStep } from './sandbox/step-output-links'
import { isMandatoryTool } from '@shared/agent/mandatory-tools'
import { PLAN_MODE_ALWAYS_IN_CATALOG_TOOL_NAMES } from '@toolSet/planning'
import { isPlanModeActive } from './coding/plan-mode-state'
import { isSubAgentAgentRun } from './run/sub-agent-run-policy'
import { createLogger } from '@main/logger'
import type { ToolInputDedupeState } from './steps/step-helpers'
import { ToolReadCache } from './expr/tool-read-cache'
import {
  ensureScopedStepKey,
  formatScopedStageId,
  formatScopedStepInstanceKey,
  randomShortId,
  stageIdForPipelineLookup,
  toolLoopFilesystemScopeFromStepKey,
} from './run/flow-scoped-ids'
import { getCurrentAgentRunScope } from './run/run-scope'
import {
  COLLECT_FORM_STEP_ID,
  PLANNING_STEP_ID,
  PROMPT_STEP_ID,
  REPORT_STEP_ID,
  SKILLS_STEP_ID,
  SUMMARY_STEP_ID,
  THINKING_STEP_ID,
  TOOL_LOOP_STEP_ID,
} from './constants/step-ids'
import { StepOutputStore } from './steps/step-output-store'
import type { StepData, StepOutputEntry } from './steps/step-io'
import type { AgentRun } from './run/agent-run'
import type { StepAttachment } from '@shared/agent/step-attachment'
import {
  buildPipelineContextMessages as buildPipelineContextMessagesHelper,
  type PipelineContextMessageOptions,
} from './context/pipeline-context-messages'
import { buildStructuredAssistantContent as buildStructuredAssistantContentHelper } from './context/structured-assistant-content'
import {
  appendStepAttachments as appendStepAttachmentsHelper,
  getAggregatedAttachmentsForStage as getAggregatedAttachmentsForStageHelper,
  getStepAttachments as getStepAttachmentsHelper,
  getToolLoopAttachmentsForTodo as getToolLoopAttachmentsForTodoHelper,
  mergeAttachmentsWithScanLinks,
  mergeToolLoopAttachmentsIntoParent as mergeToolLoopAttachmentsIntoParentHelper,
} from './context/step-attachments'
import {
  emitStepProgress as emitStepProgressHelper,
  publishStepProgress as publishStepProgressHelper,
  shouldRegisterToolLoopStepContext,
} from './context/step-progress-policy'
import {
  aggregateStringOutputsFromHistory,
  buildToolLoopOutputDigest as buildToolLoopOutputDigestHelper,
  formatAgentStepOutputBody,
  formatOrderedExecutionForSummary as formatOrderedExecutionForSummaryHelper,
  formatPlannedTasksOutlineForSummary as formatPlannedTasksOutlineForSummaryHelper,
  getCompletedStepsForId,
  latestStructuredOutputFromHistory,
} from './context/step-io-history'
import { collectSandboxArtifactPaths } from './context/sandbox-artifact-paths'

export type { PipelineContextMessageOptions }
export { collectSandboxArtifactPaths }

const STEP_OUTPUT_KEY_BY_ID: Partial<Record<AgentStepId, keyof StepOutputs>> = {
  [THINKING_STEP_ID]: 'thinking',
  [PLANNING_STEP_ID]: 'planning',
  [SKILLS_STEP_ID]: 'skills',
  [TOOL_LOOP_STEP_ID]: 'toolLoop',
  [SUMMARY_STEP_ID]: 'summary',
  [REPORT_STEP_ID]: 'report',
  [PROMPT_STEP_ID]: 'prompt',
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
  public toolReadCache: ToolReadCache
  /** Shared in-flight / succeeded dedupe keys across tool-loop streams in one turn. */
  public toolInputDedupeState: ToolInputDedupeState
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
    this.toolReadCache = new ToolReadCache()
    this.toolInputDedupeState = {
      inflightByKey: new Map(),
      succeededKeys: new Set(),
    }
    this.config = new ConfigContext(() => opts.responseLanguage)
    this.stageModels = stageModels ?? StageModelRegistry.fromOpts(opts)
    this.providers = new ProviderContext(opts, model)
    this.references = new ReferenceContext()
    this.sandbox = new SandboxContext(this.references)
    this.form = new FormContext(this as AgentFlowContext & FormFlowHost)
  }

  /**
   * Reuse the parent's read ledger / tool-input dedupe for this child run so
   * sub-agents do not re-read the same path+offset windows.
   */
  adoptToolSessionFrom(parent: AgentFlowContext): void {
    this.toolReadCache = parent.toolReadCache
    this.toolInputDedupeState = parent.toolInputDedupeState
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

  resolveDefaultLlmChoice(): AgentLlmChoice {
    return this.stageModels.getChoice('default')
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
    return buildPipelineContextMessagesHelper(this, opts)
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
    return buildStructuredAssistantContentHelper(this)
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
    return getStepAttachmentsHelper(this.stepAttachmentsByKey, stepKey)
  }

  /** Output files produced by the latest completed tool-loop run for a todo. */
  getToolLoopAttachmentsForTodo(todoId: number): StepAttachment[] {
    return getToolLoopAttachmentsForTodoHelper(
      this.getOrderedStepContexts(),
      this.stepAttachmentsByKey,
      todoId,
    )
  }

  appendStepAttachments(stepKey: string, items: readonly StepAttachment[]): void {
    appendStepAttachmentsHelper(this.stepAttachmentsByKey, stepKey, items)
  }

  /** Union tool-loop attachments (includes per-todo child runs) for structured captures. */
  getAggregatedAttachmentsForStage(stageId: FlowStageId): StepAttachment[] {
    return getAggregatedAttachmentsForStageHelper(
      this.stepHistory,
      this.stepAttachmentsByKey,
      stageId,
    )
  }

  mergeToolLoopAttachmentsIntoParent(parentStepKey: string): void {
    mergeToolLoopAttachmentsIntoParentHelper(
      {
        stepHistory: this.stepHistory,
        stepAttachmentsByKey: this.stepAttachmentsByKey,
        sandbox: this.sandbox,
        references: this.references,
        publishStepProgress: (step) => this.publishStepProgress(step),
      },
      parentStepKey,
    )
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
    if (shouldRegisterToolLoopStepContext(stepId, title, meta)) {
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
    const attachments = mergeAttachmentsWithScanLinks(
      this.stepAttachmentsByKey,
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

  private stepIoHistoryHost() {
    return {
      outputStore: this.outputStore,
      stepOutputs: this.stepOutputs,
      getOrderedStepContexts: () => this.getOrderedStepContexts(),
    }
  }

  formatPlannedTasksOutlineForSummary(): string {
    return formatPlannedTasksOutlineForSummaryHelper(this.stepIoHistoryHost())
  }

  /**
   * Ordered per-todo execution material for summary/report (stable under HITL resumes).
   */
  formatOrderedExecutionForSummary(): {
    toolExecution: string
    skillsFallback: string
  } {
    return formatOrderedExecutionForSummaryHelper(this.stepIoHistoryHost())
  }

  /** Canonical tool-loop digest for {@link stepOutputs} and downstream steps. */
  buildToolLoopOutputDigest(): string {
    return buildToolLoopOutputDigestHelper(this.stepIoHistoryHost())
  }

    /**
   * Rebuilds {@link stepOutputs} from every completed row in {@link stepHistory}
   * so multiple runs of the same stepId (todos, retries, approval resume) are all
   * visible to summary, report, and structured content builders.
   */
  rebuildStepOutputsFromHistory(): void {
    const next: StepOutputs = {}
    const ordered = this.getOrderedStepContexts()

    const thinking =
      latestStructuredOutputFromHistory<ThinkingResult>(ordered, THINKING_STEP_ID)
    if (thinking) next.thinking = thinking

    const planning =
      latestStructuredOutputFromHistory<PlanningResult>(ordered, PLANNING_STEP_ID)
    if (planning) next.planning = planning

    const ioHost = this.stepIoHistoryHost()
    const skills = aggregateStringOutputsFromHistory(ioHost, SKILLS_STEP_ID)
    if (skills) next.skills = skills

    const toolLoop = aggregateStringOutputsFromHistory(ioHost, TOOL_LOOP_STEP_ID)
    if (toolLoop) next.toolLoop = toolLoop

    let summary =
      latestStructuredOutputFromHistory<SummaryResult>(ordered, SUMMARY_STEP_ID)
    if (!summary) {
      const legacy = latestStructuredOutputFromHistory<{
        summary?: string
        reason?: string
      }>(ordered, 'analysis' as AgentStepId)
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

    const reportSteps = getCompletedStepsForId(ordered, REPORT_STEP_ID)
    const lastReport = reportSteps[reportSteps.length - 1]
    const report = lastReport
      ? (lastReport.renderedOutput?.trim() ??
        (typeof lastReport.output === 'string' ? lastReport.output.trim() : ''))
      : ''
    if (report) next.report = report

    const prompt = aggregateStringOutputsFromHistory(ioHost, PROMPT_STEP_ID)
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
    emitStepProgressHelper(
      {
        opts: this.opts,
        stepHistory: this.stepHistory,
        stepContexts: this.stepContexts,
        stepProgressTextByKey: this.stepProgressTextByKey,
        stepAttachmentsByKey: this.stepAttachmentsByKey,
        flowId: this.flowId,
        lastHitlPausedStageId: this.lastHitlPausedStageId,
        getLatestStepContext: () => this.getLatestStepContext(),
      },
      chunk,
      stepId,
      instanceKey,
    )
  }

  private getLatestStepContext(): AgentStepSnapshot | undefined {
    return [...this.stepHistory].sort((a, b) => b.sequence - a.sequence)[0]
  }

  private publishStepProgress(stepContext: AgentStepSnapshot): void {
    publishStepProgressHelper(
      {
        opts: this.opts,
        stepContexts: this.stepContexts,
        flowId: this.flowId,
        lastHitlPausedStageId: this.lastHitlPausedStageId,
        stepProgressTextByKey: this.stepProgressTextByKey,
        stepAttachmentsByKey: this.stepAttachmentsByKey,
      },
      stepContext,
    )
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
    setAgentRunConversationId(this.sandbox.getConversationId())
    setAgentRunAssistantMessageId(this.opts.assistantMessageId)
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
