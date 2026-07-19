import { createLogger } from '@main/logger'
import { AgentFlow } from '../flow/agent-flow'
import { AgentFlowBuilder } from '../flow/agent-flow-builder'
import type { FlowStageId } from '../constants/step-ids'
import { AgentFlowContext } from '../context'
import type { AgentResponseOpts } from '../types'
import {
  cloneStepContextMap,
  cloneStepHistory,
} from '../context'
import {
  deletePendingExecution,
  getPendingExecution,
  pendingExecutionStorageKey,
  setPendingExecution,
} from '../pending/store'
import type { PendingAgentExecution } from '../pending/types'
import { cloneAgentMessages, cloneStepOutputs } from '../types'
import {
  buildChildAgentResponseOpts,
  type ResolveChildAgentParams,
} from './resolve-child-agent'
import {
  getCurrentAgentRunScope,
  runWithAgentRunScope,
  type AgentRunScopeStore,
} from './run-scope'
import { randomShortId, stableRootRunId, createSubAgentRunId } from './flow-scoped-ids'
import { getWorkspacePath } from '../workspace/conversation-workspace'
import { shouldPersistAgentMemoryForRun } from '../memory/memory-persistence-gate'
import { injectResultSnapshotIntoStructuredContent } from '../utils/result-snapshot'
import {
  remainingParallelSubAgentSlots,
  spawnSubAgentRun,
  waitForSubAgentRuns,
  cancelSubAgentRun,
  type SubAgentSpawnResult,
  type SubAgentWaitResult,
} from './sub-agent-run-registry'
import {
  MAX_AGENT_RUN_DEPTH,
  type AgentRunMeta,
  type AgentRunResult,
  type PendingRunFrame,
} from './types'

const log = createLogger('agent.run')

function buildRunMeta(
  opts: AgentResponseOpts,
  overrides: Partial<AgentRunMeta> = {},
): AgentRunMeta {
  const depth = overrides.depth ?? 0
  const runId =
    overrides.runId ??
    (depth === 0
      ? stableRootRunId(opts)
      : createSubAgentRunId(overrides.agentId ?? opts.agentId))
  return {
    runId,
    parentRunId: overrides.parentRunId,
    depth,
    agentId: overrides.agentId ?? opts.agentId,
    conversationId: opts.conversationId,
    assistantMessageId: opts.assistantMessageId,
  }
}

function scopeFromMeta(
  meta: AgentRunMeta,
  sandboxRoot?: string,
  sandboxOutputScope?: string,
): AgentRunScopeStore {
  return {
    runId: meta.runId,
    parentRunId: meta.parentRunId,
    depth: meta.depth,
    sandboxRoot,
    sandboxOutputScope,
    conversationId: meta.conversationId?.trim() || undefined,
    assistantMessageId: meta.assistantMessageId?.trim() || undefined,
  }
}

/**
 * One execution instance of an {@link AgentFlow} with a unique run id and scoped sandbox.
 */
export class AgentRun {
  readonly meta: AgentRunMeta

  constructor(
    readonly flow: AgentFlow,
    meta: AgentRunMeta,
    private readonly parent?: AgentRun,
  ) {
    this.meta = meta
    this.flow.context.agentRun = this
  }

  get context(): AgentFlowContext {
    return this.flow.context
  }

  static startRoot(opts: AgentResponseOpts, model: unknown): AgentRun {
    const flow = AgentFlowBuilder.create(opts, model)
      .withConfigPipeline()
      .deferPipelineApplication(true)
      .build()
    return new AgentRun(flow, buildRunMeta(opts, { depth: 0 }))
  }

  static forFlow(flow: AgentFlow, overrides: Partial<AgentRunMeta> = {}): AgentRun {
    return new AgentRun(
      flow,
      buildRunMeta(flow.context.opts, {
        depth: 0,
        ...overrides,
      }),
    )
  }

  forkChild(params: ResolveChildAgentParams): Promise<AgentRun> {
    return AgentRun.createChild(this, params)
  }

  static async createChild(
    parent: AgentRun,
    params: ResolveChildAgentParams,
    resumeMeta?: Pick<AgentRunMeta, 'runId'>,
  ): Promise<AgentRun> {
    const depth = parent.meta.depth + 1
    if (depth > MAX_AGENT_RUN_DEPTH) {
      throw new Error(
        `Agent run nesting depth exceeded (max ${MAX_AGENT_RUN_DEPTH})`,
      )
    }

    const { opts, model } = await buildChildAgentResponseOpts({
      ...params,
      parentContext: parent.context,
      parentRunId: parent.meta.runId,
      rootRunId: parent.meta.depth === 0 ? parent.meta.runId : parent.meta.parentRunId ?? parent.meta.runId,
      parentCurrentMessages:
        params.parentCurrentMessages ?? parent.context.currentMessages,
      // Prefer child-specific abort (combined parent+cancel) when spawn sets it.
      parentOpts: {
        ...parent.context.opts,
        ...params.parentOpts,
        abortSignal:
          params.parentOpts.abortSignal ?? parent.context.opts.abortSignal,
      },
      onStepProgress: (payload) => {
        const scope = getCurrentAgentRunScope()
        const wrapped = {
          ...payload,
          runId: scope?.runId,
          parentRunId: parent.meta.runId,
          stepKey:
            scope?.runId && parent.meta.runId
              ? `${parent.meta.runId}/${scope.runId}/${payload.stepKey}`
              : payload.stepKey,
        }
        params.onStepProgress?.(wrapped)
      },
    })

    const childMeta = buildRunMeta(opts, {
      depth,
      parentRunId: parent.meta.runId,
      agentId: params.agentId,
      ...(resumeMeta?.runId ? { runId: resumeMeta.runId } : {}),
    })

    const childFlow = new AgentFlow(opts, model)
    childFlow.fromAgentConfig()

    return new AgentRun(childFlow, childMeta, parent)
  }

  async execute(): Promise<AgentRunResult> {
    const parentScope = getCurrentAgentRunScope()
    const isChild = this.meta.depth > 0
    const conversationId = this.context.opts.conversationId?.trim()
    const workspacePath =
      this.context.opts.workspacePathOverride?.trim() ||
      (conversationId ? getWorkspacePath(conversationId) : null) ||
      parentScope?.workspacePath ||
      undefined
    const initialScope = scopeFromMeta(
      this.meta,
      isChild ? undefined : parentScope?.sandboxRoot ?? this.context.getSandboxRoot(),
      isChild ? 'output' : parentScope?.sandboxOutputScope,
    )
    if (workspacePath) {
      initialScope.workspacePath = workspacePath
    }

    return runWithAgentRunScope(initialScope, async () => {
      if (this.meta.depth === 0) {
        await this.acquireSandbox()
      } else {
        await this.acquireSubAgentSandbox()
      }

      this.context.sandbox.syncBindingToTools()
      this.context.sandbox.syncWorkspaceToTools()

      try {
        let structuredContent = await this.flow.executeRunLifecycle()
        if (this.meta.depth === 0) {
          const sandboxRoot = this.context.getSandboxRoot() ?? ''
          try {
            const written = await this.context.sandbox.writeFinalResult(structuredContent)
            if (written) {
              if (written.resultSnapshotPdfPath && written.resultSnapshotPdfUrl) {
                structuredContent = injectResultSnapshotIntoStructuredContent(
                  structuredContent,
                  {
                    pdfPath: written.resultSnapshotPdfPath,
                    pdfUrl: written.resultSnapshotPdfUrl,
                  },
                )
              }
              this.context.opts.onSandboxResultWritten?.({
                conversationId: this.context.opts.conversationId ?? '',
                sandboxRoot,
                outputResultsDir: written.outputResultsDir,
                resultsFileUrl: written.resultsFileUrl,
                resultSnapshotPdfUrl: written.resultSnapshotPdfUrl,
              })
            }
          } catch (err) {
            log.warn('writeFinalResultToSandbox failed', {
              conversationId: this.context.opts.conversationId,
              sandboxRoot,
              err,
            })
          }
        }
        return {
          structuredContent,
          stepOutputs: { ...this.context.stepOutputs },
          hitlPaused:
            this.context.hitlAwaitingApproval ||
            this.context.hitlAwaitingFormData ||
            this.context.hitlAwaitingManualIntervention,
          pausedStageId: this.context.lastHitlPausedStageId,
          shouldPersistMemory: shouldPersistAgentMemoryForRun(
            this.context.opts,
            this.context,
          ),
        }
      } finally {
        if (this.meta.depth === 0) {
          this.context.sandbox.clearBindingFromTools()
        }
      }
    })
  }

  private async acquireSubAgentSandbox(): Promise<void> {
    const agentId = this.meta.agentId ?? this.context.opts.agentId ?? 'unknown'
    const rootRunId =
      this.parent?.meta.depth === 0
        ? this.parent.meta.runId
        : this.parent?.meta.runId

    await this.context.sandbox.acquireForSubAgentRun({
      agentId,
      runId: this.meta.runId,
      skillId: this.context.opts.skillId,
      conversationId: this.context.opts.conversationId,
      rootRunId,
      parentRunId: this.meta.parentRunId ?? this.parent?.meta.runId ?? '',
    })

    const sandboxRoot = this.context.getSandboxRoot() ?? ''
    log.info('Sub-agent sandbox initialized', {
      runId: this.meta.runId,
      agentId,
      depth: this.meta.depth,
      conversationId: this.context.opts.conversationId,
      sandboxRoot,
    })

    const scope = getCurrentAgentRunScope()
    if (scope) {
      scope.sandboxRoot = sandboxRoot
      scope.sandboxOutputScope = 'output'
    }
    this.context.sandbox.activateToolLoopOutputScope('output')
  }

  private async acquireSandbox(): Promise<void> {
    await this.context.sandbox.acquireForConversation(
      this.context.opts.conversationId,
      this.context.opts.skillId,
    )
    const sandboxRoot = this.context.getSandboxRoot() ?? ''
    log.info('Sandbox initialized for agent run', {
      runId: this.meta.runId,
      depth: this.meta.depth,
      conversationId: this.context.opts.conversationId,
      sandboxRoot,
    })

    const scope = getCurrentAgentRunScope()
    if (scope) {
      scope.sandboxRoot = sandboxRoot
    }

    const outputResultsDir = this.context.sandbox.defaultToolLoopPreviewDir()
    this.context.opts.onSandboxReady?.(
      this.context.sandbox.buildReadyPayload({
        conversationId: this.context.opts.conversationId,
        sandboxRoot,
        outputResultsDir,
      }),
    )
  }

  async spawnChildRun(
    params: ResolveChildAgentParams,
    opts?: { waitMode?: 'blocking' | 'background'; detached?: boolean },
  ): Promise<SubAgentSpawnResult> {
    return spawnSubAgentRun(this, params, opts)
  }

  cancelChildRun(runId: string): boolean {
    return cancelSubAgentRun(runId)
  }

  remainingParallelSlots(): number {
    return remainingParallelSubAgentSlots(this.meta.runId)
  }

  async waitForChildRuns(runIds: string[]): Promise<SubAgentWaitResult[]> {
    return waitForSubAgentRuns(runIds)
  }

  /**
   * Merge HITL state from a paused child into this parent (same as single
   * executeChildAndMerge). Used when invoke_agents wait finds awaiting_approval.
   */
  mergeChildHitlPause(
    child: AgentRun,
    result: AgentRunResult,
    parentHitlPauseStageId?: FlowStageId,
  ): void {
    if (!result.hitlPaused) return
    if (child.meta.depth > 1) {
      throw new Error(
        `Nested agent run paused at depth ${child.meta.depth}; only one level of sub-agent HITL is supported`,
      )
    }
    if (parentHitlPauseStageId) {
      this.context.setHitlPausedAtStage(parentHitlPauseStageId)
    }
    this.saveChildPendingFrame(child, result.pausedStageId)
    this.context.hitlAwaitingApproval = child.context.hitlAwaitingApproval
    this.context.hitlAwaitingFormData = child.context.hitlAwaitingFormData
    this.context.hitlAwaitingManualIntervention =
      child.context.hitlAwaitingManualIntervention
  }

  async executeChildAndMerge(
    params: ResolveChildAgentParams,
  ): Promise<AgentRunResult> {
    const { runId, promise } = await spawnSubAgentRun(this, params, {
      waitMode: 'blocking',
    })
    const record = await promise
    const child = record.childRun
    const result = record.result

    if (!result || !child) {
      throw new Error(record.error ?? `Sub-agent run ${runId} failed`)
    }

    if (result.hitlPaused) {
      this.mergeChildHitlPause(child, result, params.parentHitlPauseStageId)
    }

    return result
  }

  private saveChildPendingFrame(child: AgentRun, pausedStageId?: string): void {
    const storageKey = pendingExecutionStorageKey(
      this.context.opts.conversationId,
      this.context.opts.assistantMessageId,
    )
    if (!storageKey) return

    const childFrame: PendingRunFrame = {
      runId: child.meta.runId,
      agentId: child.meta.agentId,
      pausedStageId,
      currentMessages: cloneAgentMessages(child.context.currentMessages),
      stepOutputs: cloneStepOutputs(child.context.stepOutputs),
      stepContexts: cloneStepContextMap(child.context.stepContexts),
      stepHistory: cloneStepHistory(child.context.stepHistory),
      nextTodoIndex: child.context.resumeTodoIndex,
      collectedFormByTodoId: { ...child.context.collectedFormByTodoId },
    }

    const existing = getPendingExecution(storageKey)
    setPendingExecution(storageKey, {
      currentMessages: cloneAgentMessages(this.context.currentMessages),
      stepOutputs: cloneStepOutputs(this.context.stepOutputs),
      stepContexts: cloneStepContextMap(this.context.stepContexts),
      stepHistory: cloneStepHistory(this.context.stepHistory),
      nextTodoIndex: this.context.resumeTodoIndex ?? 0,
      collectedFormByTodoId: { ...this.context.collectedFormByTodoId },
      pausedStageId: this.context.lastHitlPausedStageId,
      runStack: [...(existing?.runStack ?? []), childFrame],
      activeRunId: child.meta.runId,
      ...(existing?.pendingApprovalTodoId != null
        ? { pendingApprovalTodoId: existing.pendingApprovalTodoId }
        : {}),
    })
  }

  /** Resume a child frame from pending storage, then return its result. */
  async resumeChildFrame(frame: PendingRunFrame): Promise<AgentRunResult> {
    if (!frame.agentId?.trim()) {
      throw new Error('Pending run frame missing agentId')
    }

    const child = await AgentRun.createChild(
      this,
      {
        agentId: frame.agentId,
        parentOpts: this.context.opts,
        task:
          frame.currentMessages.filter((m) => m.role === 'user').at(-1)?.content ?? '',
      },
      { runId: frame.runId },
    )

    child.context.restoreStepState(
      cloneStepOutputs(frame.stepOutputs),
      cloneStepContextMap(frame.stepContexts),
      cloneStepHistory(frame.stepHistory),
      cloneAgentMessages(frame.currentMessages),
    )
    child.context.collectedFormByTodoId = { ...frame.collectedFormByTodoId }
    if (typeof frame.nextTodoIndex === 'number') {
      child.context.resumeTodoIndex = frame.nextTodoIndex
    }

    child.context.hitlAwaitingApproval = false
    child.context.hitlAwaitingFormData = false
    child.context.hitlAwaitingManualIntervention = false
    child.flow.fromAgentConfig()

    const parentScope = getCurrentAgentRunScope()
    const childScope = scopeFromMeta(child.meta, undefined, 'output')

    return runWithAgentRunScope(childScope, async () => {
      await child.context.sandbox.acquireForSubAgentRun({
        agentId: frame.agentId,
        runId: child.meta.runId,
        skillId: child.context.opts.skillId,
        conversationId: child.context.opts.conversationId,
        rootRunId: this.meta.runId,
        parentRunId: this.meta.runId,
      })
      const sandboxRoot = child.context.getSandboxRoot() ?? ''
      childScope.sandboxRoot = sandboxRoot
      child.context.sandbox.syncBindingToTools()
      child.context.sandbox.syncWorkspaceToTools()
      child.context.sandbox.activateToolLoopOutputScope('output')

      const structuredContent = await child.flow.executePipeline(
        frame.pausedStageId ? { startFromStageId: frame.pausedStageId } : undefined,
      )

      return {
        structuredContent,
        stepOutputs: { ...child.context.stepOutputs },
        hitlPaused:
          child.context.hitlAwaitingApproval ||
          child.context.hitlAwaitingFormData ||
          child.context.hitlAwaitingManualIntervention,
        pausedStageId: child.context.lastHitlPausedStageId,
        shouldPersistMemory: shouldPersistAgentMemoryForRun(
          child.context.opts,
          child.context,
        ),
      }
    })
  }
}
