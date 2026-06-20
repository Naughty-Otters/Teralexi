import { createLogger } from '@main/logger'
import type { AgentResponseOpts } from '../types'
import { clientUiIndicatesToolApprovalResume } from '../utils'
import { cloneStepContextMap, cloneStepHistory, AgentFlowContext } from '../context'
import { findPendingFormExecutionByRequestId } from '../form/pending-state'
import {
  deletePendingExecution,
  getPendingExecution,
  pendingExecutionStorageKey,
  setPendingExecution,
} from '../pending/store'
import {
  findPendingManualInterventionExecution,
  hasNewUserFollowUpSincePending,
  mergePendingMessagesWithFollowUp,
  resetManualInterventionTodoInStepOutputs,
} from '../pending/manual-intervention-resume'
import type { PendingAgentExecution } from '../pending/types'
import { cloneAgentMessages, cloneStepOutputs } from '../types'
import type { CustomStepOptions } from './step-prompts'
import {
  executeFlowPipeline,
  FlowPipelineRegistry,
  resolvedPipelineStageIds,
  type FlowConditionalBranch,
  type FlowStageId,
  type FlowStepConfig,
  type PipelineEntry,
  type ToolLoopRunOptions,
} from './pipeline'
import { createFlowStageRegistry } from './stage-runners'
import {
  isStepExpression,
  resolvePipelineStepInput,
  type StepExpression,
  type StepExprFactory,
} from '../expr'
import {
  defaultPlanningTodoItems,
  type ForEachItemConfig,
} from '../steps/foreach-item-config'
import { forEachItemWithExpression } from '../steps/foreach-item-run'
import { FOREACH_ITEM_STEP_ID, SUB_FLOW_STEP_ID } from '../constants/step-ids'
import type { CompiledDsl } from './dsl/compile'
import { subFlowFlowStepDefinition } from '../steps/sub-flow-step'
import type { SubFlowConfig } from '../steps/sub-flow-config'
import { foreachItemFlowStepDefinition } from '../steps/foreach-item-step'
import { buildPipelineEntry } from './pipeline-entry'
import { FlowBranchCollector } from './flow-branch-collector'
import { FlowConditionalBuilder } from './flow-conditional'
import { FlowFluentStages } from './flow-fluent-stages'
import {
  ConfigDrivenAgentPipeline,
  DefaultAgentRunPipeline,
  type AgentFlowPipelineRecipe,
} from './pipelines/agent-flow-pipeline'
import { ThinkingBranchComposer } from './pipelines/thinking-branches'

const log = createLogger('agent.flow')

/**
 * Base agent flow: fluent stage registration, pipeline storage, and run/HITL lifecycle.
 *
 * Preset pipelines ({@link DefaultAgentRunPipeline}, {@link ConfigDrivenAgentPipeline}, etc.)
 * live under `./pipelines/`; prefer {@link AgentFlowBuilder} to construct a flow with a recipe.
 */
export class AgentFlowBase {
  private readonly registry: FlowPipelineRegistry
  private pipeline: PipelineEntry[] = []
  private readonly conditionalBranches: FlowConditionalBranch[] = []
  private readonly fluents: FlowFluentStages<this>

  constructor(
    readonly ctx: AgentFlowContext,
    registry: FlowPipelineRegistry = createFlowStageRegistry(),
  ) {
    this.registry = registry
    this.ctx.pipelineRegistry = registry
    this.fluents = new FlowFluentStages(this)
  }

  /** Active flow context for this pipeline definition / run. */
  get context(): AgentFlowContext {
    return this.ctx
  }

  pushPipelineEntry(entry: PipelineEntry): void {
    this.pipeline.push(entry)
  }

  /** Load a compiled DSL pipeline onto this flow (clears any prior fluent chain). */
  fromDsl(compiled: CompiledDsl): this {
    this.pipeline = [...compiled.pipeline]
    this.conditionalBranches.length = 0
    this.conditionalBranches.push(...compiled.conditionals)
    return this
  }

  /** Start a new pipeline (clears any prior fluent chain). */
  begin(): this {
    this.pipeline = []
    this.conditionalBranches.length = 0
    return this
  }

  /** Apply a pipeline recipe (clears any prior fluent chain first). */
  applyPipeline(recipe: AgentFlowPipelineRecipe): this {
    this.begin()
    recipe.apply(this)
    return this
  }

  step(id: FlowStageId, input?: StepExpression | FlowStepConfig): this {
    this.fluents.step(id, input)
    return this
  }

  thinking(
    input?: StepExpression | ((factory: StepExprFactory) => StepExpression),
  ): this {
    this.fluents.thinking(input)
    return this
  }

  subFlow(config: SubFlowConfig): this {
    this.pushPipelineEntry(
      buildPipelineEntry(SUB_FLOW_STEP_ID, subFlowFlowStepDefinition, {
        subFlow: config,
      }),
    )
    return this
  }

  toolLoop(
    input?: StepExpression | ToolLoopRunOptions | ((factory: StepExprFactory) => StepExpression),
  ): this {
    this.fluents.toolLoop(input)
    return this
  }

  customStep(options: CustomStepOptions): this {
    this.fluents.customStep(options)
    return this
  }

  forEachItem(
    input: ForEachItemConfig | ((b: FlowBranchCollector) => FlowBranchCollector),
  ): this {
    if (typeof input === 'function') {
      const collector = input(this.spawnBranch())
      const entries = [...collector.entries]
      if (entries.length > 1) {
        throw new Error(
          'forEachItem callback must add exactly one stage; multi-step per-item is not supported',
        )
      }
      const firstExpr = entries[0]?.config?.expressionPlan
      if (firstExpr) {
        this.pushPipelineEntry(
          buildPipelineEntry(
            FOREACH_ITEM_STEP_ID,
            foreachItemFlowStepDefinition,
            forEachItemWithExpression({
              itemsFrom: defaultPlanningTodoItems,
              expression: firstExpr,
            }),
          ),
        )
        return this
      }
      this.pushPipelineEntry(
        buildPipelineEntry(FOREACH_ITEM_STEP_ID, foreachItemFlowStepDefinition, {
          foreachItem: { preset: 'hasTodoItems' },
        }),
      )
      return this
    }
    this.fluents.forEachItem(input)
    return this
  }

  when(predicate: (ctx: AgentFlowContext) => boolean): FlowConditionalBuilder {
    return new FlowConditionalBuilder(
      this,
      predicate,
      this.pipeline.length,
      () => this.spawnBranch(),
      (branch) => this.registerConditional(branch),
    )
  }

  steps(entries: PipelineEntry[]): this {
    this.pipeline = [...entries]
    return this
  }

  /** Full default chain expressed via the fluent API. */
  defaultPipeline(): this {
    return this.applyPipeline(new DefaultAgentRunPipeline())
  }

  /** Stages enabled by this agent's `executionSteps` config. */
  fromAgentConfig(): this {
    return this.applyPipeline(new ConfigDrivenAgentPipeline(this.ctx))
  }

  /** @internal Used by branch recipes; prefer {@link ThinkingBranchComposer}. */
  branchAfterThinking(options: { runToolLoop: boolean }): this {
    ThinkingBranchComposer.branchAfterThinking(this, options)
    return this
  }

  pipelineStages(): readonly FlowStageId[] {
    return this.pipeline.map((e) => e.id)
  }

  resolvedPipelineStages(ctx: AgentFlowContext = this.ctx): readonly FlowStageId[] {
    return resolvedPipelineStageIds(
      this.pipeline,
      this.conditionalBranches,
      ctx,
    )
  }

  hasConfiguredPipeline(): boolean {
    return this.pipeline.length > 0 || this.conditionalBranches.length > 0
  }

  private ensurePipelineForRun(): void {
    if (!this.hasConfiguredPipeline()) {
      this.fromAgentConfig()
    }
  }

  async executeRunLifecycle(): Promise<string> {
    return this.runWithSandbox()
  }

  private returnIfHitlPaused(): string | null {
    if (
      !this.ctx.hitlAwaitingApproval &&
      !this.ctx.hitlAwaitingFormData &&
      !this.ctx.hitlAwaitingManualIntervention
    ) {
      return null
    }
    log.info('Agent flow paused for user interaction', {
      conversationId: this.ctx.opts.conversationId,
      assistantMessageId: this.ctx.opts.assistantMessageId,
      awaitingApproval: this.ctx.hitlAwaitingApproval,
      awaitingFormData: this.ctx.hitlAwaitingFormData,
      awaitingManualIntervention: this.ctx.hitlAwaitingManualIntervention,
    })
    return this.ctx.buildStructuredAssistantContent()
  }

  private applyEarlyClientHitlFormPickup(): void {
    this.ctx.form.applyCollectFormResponsesToUiMessages()
  }

  async executePipeline(options?: {
    startIndex?: number
    startFromStageId?: FlowStageId | string
  }): Promise<string> {
    if (
      this.pipeline.length === 0 &&
      this.conditionalBranches.length === 0
    ) {
      log.warn('executePipeline called with empty pipeline')
      return this.ctx.buildStructuredAssistantContent()
    }

    log.debug('Executing agent pipeline', { stages: this.pipelineStages(), ...options })

    return executeFlowPipeline({
      ctx: this.ctx,
      linear: this.pipeline,
      conditionalBranches: this.conditionalBranches,
      registry: this.registry,
      returnIfHitlPaused: () => this.returnIfHitlPaused(),
      startIndex: options?.startIndex,
      startFromStageId: options?.startFromStageId,
    })
  }

  private async runHitlContinuation(
    pausedStageId: string | undefined,
    options?: { releasePendingExecutionKey?: string },
  ): Promise<string> {
    this.fromAgentConfig()

    const result = await this.executePipeline(
      pausedStageId ? { startFromStageId: pausedStageId } : undefined,
    )

    const hitl = this.returnIfHitlPaused()
    if (hitl !== null) {
      return hitl
    }

    if (options?.releasePendingExecutionKey) {
      deletePendingExecution(options.releasePendingExecutionKey)
    }

    log.info('HITL continuation completed pipeline', {
      conversationId: this.ctx.opts.conversationId,
      assistantMessageId: this.ctx.opts.assistantMessageId,
      stages: this.resolvedPipelineStages(),
      resumedFromStage: pausedStageId,
    })
    return result
  }

  private async runWithSandbox(): Promise<string> {
    this.applyEarlyClientHitlFormPickup()

    const hitlFinal = await this.tryCompleteHitlResumeIfNeeded()
    if (typeof hitlFinal === 'string') {
      return hitlFinal
    }

    this.ensurePipelineForRun()
    const result = await this.executePipeline()

    log.info('Agent flow completed', {
      conversationId: this.ctx.opts.conversationId,
      assistantMessageId: this.ctx.opts.assistantMessageId,
      stages: this.resolvedPipelineStages(),
    })
    return result
  }

  private async tryCompleteHitlResumeIfNeeded(): Promise<string | undefined> {
    const storeKey = this.getPendingStoreKey()
    const nested = await this.tryResumeNestedRunStack(storeKey)
    if (typeof nested === 'string') {
      return nested
    }

    const formResp = this.ctx.form.extractCollectFormResponse()
    if (formResp) {
      let formResumeKey = storeKey
      let pending = formResumeKey ? getPendingExecution(formResumeKey) : undefined
      if (!pending && this.ctx.opts.conversationId) {
        const found = findPendingFormExecutionByRequestId(
          this.ctx.opts.conversationId,
          formResp.requestId,
        )
        if (found) {
          formResumeKey = found.storeKey
          pending = found.pending
        }
      }

      if (formResumeKey && pending) {
        if (pending.pendingFormRequestId !== formResp.requestId) {
          log.warn('Form response id differs from pending snapshot; resuming anyway', {
            got: formResp.requestId,
            expected: pending.pendingFormRequestId,
          })
        }
        return this.resumeAfterFormSubmissionFromPending(
          formResumeKey,
          pending,
          formResp.values,
        )
      }

      log.warn(
        'Form response received but no pending execution snapshot; applied values to context — will run full flow',
        {
          requestId: formResp.requestId,
          storeKey,
          todoId: formResp.todoId,
        },
      )
    }

    if (clientUiIndicatesToolApprovalResume(this.ctx.opts.clientUiMessages)) {
      return this.resumeAfterApprovalResponse(storeKey)
    }

    const manualPending = findPendingManualInterventionExecution(
      this.ctx.opts.conversationId,
    )
    if (
      manualPending &&
      hasNewUserFollowUpSincePending(
        manualPending.pending,
        this.ctx.opts.messages,
      )
    ) {
      return this.resumeAfterManualInterventionFollowUp(
        manualPending.storeKey,
        manualPending.pending,
      )
    }

    return undefined
  }

  private async tryResumeNestedRunStack(
    storeKey: string | undefined,
  ): Promise<string | undefined> {
    if (!storeKey) return undefined
    const pending = getPendingExecution(storeKey)
    const stack = pending?.runStack
    if (!stack?.length || !this.ctx.agentRun) {
      return undefined
    }

    const frame = stack[stack.length - 1]!
    log.info('Resuming nested sub-agent run from pending stack', {
      runId: frame.runId,
      agentId: frame.agentId,
      pausedStageId: frame.pausedStageId,
    })

    const result = await this.ctx.agentRun.resumeChildFrame(frame)
    if (result.hitlPaused) {
      return this.ctx.buildStructuredAssistantContent()
    }

    const remaining = stack.slice(0, -1)
    const updatedPending: PendingAgentExecution = {
      ...pending!,
      runStack: remaining.length > 0 ? remaining : undefined,
      activeRunId: remaining[remaining.length - 1]?.runId,
    }
    setPendingExecution(storeKey, updatedPending)

    this.ctx.hitlAwaitingApproval = false
    return this.runHitlContinuation(
      pending?.pausedStageId,
      remaining.length === 0 ? { releasePendingExecutionKey: storeKey } : undefined,
    )
  }

  private getPendingStoreKey(): string | undefined {
    return pendingExecutionStorageKey(
      this.ctx.opts.conversationId,
      this.ctx.opts.assistantMessageId,
    )
  }

  private restorePendingState(
    pending: PendingAgentExecution,
    options?: {
      currentMessages?: PendingAgentExecution['currentMessages']
      stepOutputs?: PendingAgentExecution['stepOutputs']
    },
  ): void {
    this.ctx.restoreStepState(
      cloneStepOutputs(options?.stepOutputs ?? pending.stepOutputs),
      cloneStepContextMap(pending.stepContexts),
      cloneStepHistory(pending.stepHistory),
      options?.currentMessages
        ? cloneAgentMessages(options.currentMessages)
        : cloneAgentMessages(pending.currentMessages),
    )
    this.ctx.collectedFormByTodoId = {
      ...pending.collectedFormByTodoId,
    }
    // Restore LLM-generated form schemas so they don't need to be regenerated on resume.
    if (pending.generatedFormSchemas) {
      for (const [id, schema] of Object.entries(pending.generatedFormSchemas)) {
        this.ctx.generatedFormSchemaByTodoId.set(Number(id), schema)
      }
    }
    if (pending.researchResumeState) {
      this.ctx.researchResumeState = pending.researchResumeState
    }
  }

  private async resumeAfterFormSubmissionFromPending(
    storeKey: string,
    pending: PendingAgentExecution,
    formValues: Record<string, unknown>,
  ): Promise<string> {
    log.info('Resuming agent flow after form submission', {
      conversationId: this.ctx.opts.conversationId,
      assistantMessageId: this.ctx.opts.assistantMessageId,
      nextTodoIndex: pending.nextTodoIndex,
    })
    deletePendingExecution(storeKey)
    this.restorePendingState(pending)
    if (typeof pending.pendingFormTodoId === 'number') {
      this.ctx.collectedFormByTodoId[pending.pendingFormTodoId] = formValues
    }
    this.ctx.hitlAwaitingFormData = false
    this.ctx.hitlAwaitingManualIntervention = false
    return this.resumeAfterFormSubmission(
      pending.nextTodoIndex,
      pending.pausedStageId,
    )
  }

  private async resumeAfterApprovalResponse(
    storeKey: string | undefined,
  ): Promise<string> {
    const pending = storeKey ? getPendingExecution(storeKey) : undefined
    if (pending) {
      this.restorePendingState(pending)
    }
    const resumeTodoIndex = pending?.nextTodoIndex ?? 0

    log.info('Resuming agent flow after approval response', {
      conversationId: this.ctx.opts.conversationId,
      assistantMessageId: this.ctx.opts.assistantMessageId,
      resumeTodoIndex,
    })
    this.ctx.hitlAwaitingApproval = false
    this.ctx.hitlAwaitingFormData = false
    this.ctx.hitlAwaitingManualIntervention = false
    this.ctx.approvalResumeTodoIndex = pending?.nextTodoIndex
    this.ctx.resumeTodoIndex = resumeTodoIndex
    if (typeof pending?.pendingApprovalTodoId === 'number') {
      log.info('Tool approval resume scoped to todo', {
        resumeTodoIndex: pending.nextTodoIndex,
        pendingApprovalTodoId: pending.pendingApprovalTodoId,
      })
    }

    return this.runHitlContinuation(
      pending?.pausedStageId,
      {
        releasePendingExecutionKey: storeKey?.trim() ? storeKey : undefined,
      },
    )
  }

  private async resumeAfterFormSubmission(
    startTodoIndex: number,
    pausedStageId?: string,
  ): Promise<string> {
    this.ctx.hitlAwaitingApproval = false
    this.ctx.hitlAwaitingFormData = false
    this.ctx.hitlAwaitingManualIntervention = false
    this.ctx.resumeTodoIndex = startTodoIndex
    return this.runHitlContinuation(pausedStageId)
  }

  private async resumeAfterManualInterventionFollowUp(
    storeKey: string,
    pending: PendingAgentExecution,
  ): Promise<string> {
    const stepOutputs = cloneStepOutputs(pending.stepOutputs)
    resetManualInterventionTodoInStepOutputs(
      stepOutputs,
      pending.nextTodoIndex,
      pending.pendingManualInterventionTodoId,
    )
    const mergedMessages = mergePendingMessagesWithFollowUp(
      pending,
      this.ctx.opts.messages,
    )

    log.info('Resuming agent flow after manual intervention follow-up', {
      conversationId: this.ctx.opts.conversationId,
      assistantMessageId: this.ctx.opts.assistantMessageId,
      resumeTodoIndex: pending.nextTodoIndex,
      pendingManualInterventionTodoId: pending.pendingManualInterventionTodoId,
    })

    this.restorePendingState(pending, {
      stepOutputs,
      currentMessages: mergedMessages,
    })

    this.ctx.hitlAwaitingApproval = false
    this.ctx.hitlAwaitingFormData = false
    this.ctx.hitlAwaitingManualIntervention = false
    this.ctx.resumeTodoIndex = pending.nextTodoIndex
    this.ctx.todoRecoveryAttempt = true

    return this.runHitlContinuation(pending.pausedStageId, {
      releasePendingExecutionKey: storeKey,
    })
  }

  private spawnBranch(): FlowBranchCollector {
    return new FlowBranchCollector()
  }

  private registerConditional(branch: FlowConditionalBranch): void {
    this.conditionalBranches.push(branch)
  }
}
