import {
  jsonSchema,
  stepCountIs,
  type ModelMessage,
} from '@teralexi-ai'
import { resolveToolLoopMaxIterations, resolveTodoMaxRetries } from '@shared/agent/tool-loop'
import { buildRunScriptInstruction } from '@toolSet/shell-command'
import {
  buildAgentModelMessages,
  mapAgentMessagesToModelMessages,
  sanitizeModelMessagesForAgent,
  sliceClientUiMessagesForToolApprovalContinuation,
  clientUiIndicatesToolApprovalResume,
} from '../utils'
import { inferReferenceScriptsFromText } from '../utils/agent-parsing'
import {
  resolvePlannedTodoItem,
  resolveTodoReferenceScripts,
} from '../utils/planning-fields'
import type { AgentFlowContext, AgentStepContext } from '../context'
import { thinkingWantsDirectAnswer } from './thinking-utils'
import { updateTodosAllDoneSpinStopWhen } from './update-todos-stop'
import {
  clearActivePlanTodoContent,
  setActivePlanTodoContent,
} from '../coding/active-plan-todo'
import { referenceDocBasename } from '../resources/reference-ops'
import type {
  ReferenceDoc,
  ReferenceScript,
  PlanningResult,
  TodoItem,
} from '../types'
import { mergeExpressionPlans } from './merge-expression-plans'
import { expressionPlanIsRunnable } from './expression-plan'
import { runExpressionPlanOnContext } from './expression-runner'
import { applyToolGuardrails, ToolGuardrailController } from './tool-guardrails'
import { applyToolOutputTruncation } from './context-overflow-guard'
import {
  applyToolResultRecording,
  type ToolResultRecordingCtx,
} from './tool-result-recorder'
import { applyToolAttachmentCollection } from './tool-attachment-collector'
import { applyLspDiagnostics } from '../lsp'
import { prepareLoopMessages } from './prepare-loop-messages'
import { applyToolResultPresentation } from './apply-tool-result-presentation'
import {
  detectTopicSwitch,
  resolveEffectiveThreadTag,
  resolveWindowOldestTimestamp,
} from './thread-context-builder'
import { StepExpressionDefinitionBase } from './step-expr-base'
import type { StepRunContext } from '../flow/step-hook'
import {
  appendLinkedMarkdownReferenceSections,
  collectPlannedReferenceHrefKeys,
} from '../steps/step-reference-link-expand'
import { applySessionToolApprovals } from '../session-tool-approval'
import {
  assembleInstructions,
  buildSkillsInstructionsBlock,
  createPrepareStepFromInjectors,
} from '../injection'
import { applyCodingAgentPolicy } from '../coding/coding-agent-policy'
import { maybeAutoActivatePlanMode } from '../coding/auto-plan-mode'
import {
  clientUiIndicatesExitPlanModeApprovalResume,
  finalizeExitPlanModeApprovalResume,
} from '../coding/plan-mode-exit-approval-resume'
import {
  runApprovedPlanTodoForeach,
  shouldRunPlanTodoForeach,
} from '../coding/plan-mode-execution-bridge'
import { isPlanExecutionActive } from '../coding/plan-mode-state'
import { nudgeExitPlanModeIfNeeded } from '../coding/plan-mode-exit-nudge'
import { serializeForAgentCollect } from '../llm/ui-message-projector'
import { PLAN_MODE_TOOL_NAMES } from '@toolSet/planning'
import { INVOKE_AGENT_TOOL_NAME, SUB_AGENT_TOOL_NAMES } from '@toolSet/sub-agents'
import {
  buildSubAgentCatalog,
  formatSubAgentToolSuffix,
} from '../delegation/skill-routing-catalog'
import { applyRuntimePlanModeGate } from '../coding/plan-mode-runtime-gate'
import {
  isPlanModeTodosAllDoneOnDisk,
  reconcilePlanExecutionStateFromDisk,
  resolvePlanStorageOptionsForContext,
} from '../coding/plan-mode-execution-bridge'
import { applyPlanExecutionTodoGate } from '../coding/plan-mode-execution-todo-gate'
import {
  applyPerStreamToolInputDedupe,
  callMcpToolDirect,
  callSkillToolDirect,
  filterToolsByAvailableSet,
  resolveToolPathNormalizeContextFromRunCtx,
  savePendingApprovalState,
  stepLog,
  createAgent,
  streamAgent,
  buildTodoStepGoalForExecution,
  isAbortError,
} from '../steps/step-helpers'
import { applyRunScopedReadCache } from './tool-read-cache'
import { applyReadFileLedgerGate } from './read-file-ledger-gate'
import { assertFileToolPermissionAllowed } from '../permissions/tool-permission-gate'
import {
  TOOL_LOOP_STEP_ID,
  TOOL_LOOP_STEP_TITLE,
  formatToolLoopTaskStepTitle,
} from '../constants/step-ids'
import {
  REFERENCE_CONTENT_LABELS,
  RETRY_CONTEXT,
  STEP_ERRORS,
} from '../constants/pipeline'
import { resolveFlowStepExecutorInstructions } from '../flow/step-prompts'
import { SKILLS_TOOL_EXECUTION_LLM } from '../constants/skills-tool-llm'
import type { TodoExecutionResult } from '../steps/todo-execution-types'
import { classifyLlmError } from '../providers/error-classifier'
import { logLlmError, formatLlmErrorProgressChunk } from '../llm/log-llm-error'
import {
  resolveToolLoopFallback,
  type ToolLoopFailureKind,
} from './tool-loop-fallback'

export { type TodoExecutionResult } from '../steps/todo-execution-types'

/** @internal Exported for unit tests — builds the tool-loop tool map including invoke_* tools. */
export { buildAgentToolSet as buildAgentToolSetForTests }

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ExecuteTodoParams = {
  todoItem: TodoItem
  todoIndexInPlan: number
  plan: PlanningResult | undefined
  attempt: number
  maxAttempts: number
  lastRetryContext: string
  route: 'normal' | 'tool-approval' | 'form-submit'
  collectedFormJson?: string
  /** When set, live tool-loop tokens stream to this batch parent (e.g. foreach orchestrator ctx). */
  stepProgressCtx?: AgentStepContext
  /** Use failure-recovery LLM (retry attempt or manual-intervention follow-up). */
  useRecoveryLlm?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Shared utilities
// ─────────────────────────────────────────────────────────────────────────────

type ToolLoopRunGate = Pick<
  AgentStepContext,
  'opts' | 'runtimeTools'
> &
  Pick<AgentFlowContext, 'outputStore' | 'stepOutputs'>

export { buildSkillsInstructionsBlock }

/** Whether the built-in tool-loop agent should run (skill or MCP tools present). */
export function toolLoopStageShouldRun(ctx: ToolLoopRunGate): boolean {
  if (thinkingWantsDirectAnswer(ctx)) return false
  const flowCtx = ctx as AgentFlowContext
  if (flowCtx.opts?.conversationId) {
    reconcilePlanExecutionStateFromDisk(flowCtx)
    if (isPlanModeTodosAllDoneOnDisk(flowCtx)) return false
  }
  const tools = ctx.runtimeTools ?? []
  return (
    (Boolean(ctx.opts?.skillId) ||
      tools.some((tool) => tool.source === 'mcp')) &&
    tools.length > 0
  )
}

interface BuildToolSetOpts {
  guardrails?: ToolGuardrailController
  haltCtrl?: AbortController
  recordingCtx?: ToolResultRecordingCtx
}

function isRootAgentRun(runCtx: AgentStepContext): boolean {
  const depth = runCtx.agentRun?.meta?.depth
  return depth === undefined || depth === 0
}

function buildAgentToolSet(
  tools: ReturnType<typeof filterToolsByAvailableSet>,
  runCtx: AgentStepContext,
  skillId?: string,
  opts?: BuildToolSetOpts,
): Record<string, unknown> {
  const userId = runCtx.opts.userId
  const toolSet: Record<string, unknown> = {}
  const toolNames = tools.map((t) => t.name)
  const subAgentCatalog = buildSubAgentCatalog(runCtx, toolNames)

  for (const toolMeta of tools) {
    if (PLAN_MODE_TOOL_NAMES.has(toolMeta.name) && !isRootAgentRun(runCtx)) {
      continue
    }
    if (SUB_AGENT_TOOL_NAMES.has(toolMeta.name) && !isRootAgentRun(runCtx)) {
      continue
    }
    if (
      toolMeta.name === INVOKE_AGENT_TOOL_NAME &&
      !runCtx.executionSteps?.toolLoop?.allowSubAgents
    ) {
      continue
    }
    const baseDesc = runCtx.config.buildToolPromptDescription(toolMeta)
    const suffix =
      subAgentCatalog && SUB_AGENT_TOOL_NAMES.has(toolMeta.name)
        ? formatSubAgentToolSuffix(toolMeta.name, subAgentCatalog)
        : null
    const needsApproval = SUB_AGENT_TOOL_NAMES.has(toolMeta.name)
      ? false
      : (toolMeta.needsApproval ?? false)
    toolSet[toolMeta.name] = {
      type: 'function' as const,
      description: suffix ? baseDesc + suffix : baseDesc,
      inputSchema:
        toolMeta.inputSchema != null
          ? jsonSchema(toolMeta.inputSchema)
          : (jsonSchema({
              type: 'object',
              additionalProperties: true,
            }) as never),
      needsApproval,
      async execute(input: unknown) {
        if (toolMeta.source === 'mcp') {
          return callMcpToolDirect(
            userId,
            (toolMeta as { serverId: string }).serverId,
            (toolMeta as { toolName: string }).toolName,
            input,
            runCtx,
          )
        }
        if (!skillId?.trim()) {
          throw new Error(
            STEP_ERRORS.TOOL_NO_SKILL_ID.replace('{toolName}', toolMeta.name),
          )
        }
        if (
          input != null &&
          typeof input === 'object' &&
          !Array.isArray(input)
        ) {
          assertFileToolPermissionAllowed(
            toolMeta.name,
            input as Record<string, unknown>,
            runCtx.opts.conversationId,
          )
        }
        return callSkillToolDirect(skillId, toolMeta.name, input, runCtx)
      },
    }
  }

  // Guardrails → truncation → recording → dedupe (outermost).
  if (opts?.guardrails && opts?.haltCtrl) {
    applyToolGuardrails(toolSet, opts.guardrails, opts.haltCtrl)
  }

  applyToolOutputTruncation(toolSet)

  // Append LSP diagnostics to file-change results (after truncation so they
  // survive, before recording so the persisted result includes them).
  applyLspDiagnostics(toolSet)
  applyToolResultPresentation(toolSet, {
    getSandboxRoot: () => runCtx.sandbox.getRoot(),
  })

  if (opts?.recordingCtx) {
    applyToolResultRecording(toolSet, opts.recordingCtx)
  }

  applyToolAttachmentCollection(toolSet, {
    getStepKey: () => runCtx.stepInstanceKey,
    getSandboxRoot: () => runCtx.sandbox.getRoot(),
    onAttachments: (items) => {
      runCtx.agentFlow.appendStepAttachments(runCtx.stepInstanceKey, items)
      publishToolLoopAttachmentsForParent(runCtx.flowContext)
    },
  })

  const pathContext = resolveToolPathNormalizeContextFromRunCtx(runCtx)
  applyRunScopedReadCache(toolSet, {
    cache: runCtx.agentFlow.toolReadCache,
    getPathContext: () => pathContext,
  })
  applyReadFileLedgerGate(toolSet, {
    cache: runCtx.agentFlow.toolReadCache,
    getPathContext: () => pathContext,
  })
  applyPerStreamToolInputDedupe(toolSet as Record<string, any>, {
    state: runCtx.agentFlow.toolInputDedupeState,
    pathContext,
  })
  applySessionToolApprovals(toolSet, runCtx.opts.conversationId)
  applyCodingAgentPolicy(
    toolSet as Record<string, { needsApproval?: unknown }>,
    runCtx.opts.conversationId,
    skillId,
    runCtx.agentRun?.meta?.depth,
  )
  applyRuntimePlanModeGate(
    toolSet as Record<string, { execute?: (input: unknown) => Promise<unknown> }>,
    runCtx.opts.conversationId,
    skillId,
    runCtx.agentRun?.meta?.depth,
  )
  applyPlanExecutionTodoGate(
    toolSet as Record<string, { execute?: (input: unknown) => Promise<unknown> }>,
    runCtx.opts.conversationId,
    resolvePlanStorageOptionsForContext(runCtx),
  )
  return toolSet
}

/** Exported for regression tests — iteration budget + allDone update_todos spin break. */
export function resolveToolLoopStopWhen(flowCtx: AgentStepContext) {
  const maxIterations = resolveToolLoopMaxIterations(
    flowCtx.executionSteps?.toolLoop?.maxIterations ??
      flowCtx.opts.toolLoopMaxIterations,
  )
  // Iteration budget always applies. Also break when the model spins on
  // update_todos after the list is already allDone (common with toolChoice loops).
  // We no longer halt after a single run_script/run_script_file so the agent can
  // chain build → test → fix.
  return [stepCountIs(maxIterations), updateTodosAllDoneSpinStopWhen()]
}

export function resolveToolLoopMaxTurns(flowCtx: AgentStepContext): number {
  return resolveToolLoopMaxIterations(
    flowCtx.executionSteps?.toolLoop?.maxIterations ??
      flowCtx.opts.toolLoopMaxIterations,
  )
}

/**
 * Discipline for the live task tracker, included only when `update_todos` is
 * available. Mirrors the strict in_progress/completed cadence that keeps long
 * multi-step jobs coherent.
 */
/** Merge child tool-loop artifacts onto the visible parent step and stream to the UI. */
export function publishToolLoopAttachmentsForParent(
  flow: AgentFlowContext,
  parentKey?: string,
): void {
  const key = parentKey?.trim() || flow.stepContexts[TOOL_LOOP_STEP_ID]?.key
  if (key) flow.mergeToolLoopAttachmentsIntoParent(key)
}

function publishVisibleToolLoopAttachments(ctx: AgentStepContext): void {
  publishToolLoopAttachmentsForParent(ctx.flowContext)
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone tool-loop (no planning todos)
// ─────────────────────────────────────────────────────────────────────────────

function appendStandaloneRetryToUserContent(
  userContent: string,
  attempt: number,
  maxAttempts: number,
  lastRetryContext: string,
): string {
  if (attempt <= 1 || !lastRetryContext.trim()) {
    return userContent
  }
  return `${userContent}\n\n${RETRY_CONTEXT.RETRY_ATTEMPT.replace('{attempt}', String(attempt)).replace('{maxAttempts}', String(maxAttempts))}:\n\n${lastRetryContext}\n\n${SKILLS_TOOL_EXECUTION_LLM.RETRY_STEP_USER_SUFFIX}`
}

function detectStandaloneStreamFailure(
  collected: { text: string; awaitingToolApproval: boolean },
  haltCtrl: AbortController,
): ToolLoopFailureKind | undefined {
  if (collected.awaitingToolApproval) return undefined
  if (
    haltCtrl.signal.aborted &&
    String(haltCtrl.signal.reason) === 'guardrail-halt'
  ) {
    return 'guardrail_halt'
  }
  if (!collected.text.trim()) {
    return 'no_output'
  }
  return undefined
}

/** Runs a tool-loop {@link Agent} for a single standalone step (no planning todos). */
async function runStandaloneAgent(parentCtx: AgentStepContext): Promise<void> {
  parentCtx.beginStep(TOOL_LOOP_STEP_ID, TOOL_LOOP_STEP_TITLE)
  const toolLoopCtx = parentCtx.createStepContext(
    TOOL_LOOP_STEP_ID,
    TOOL_LOOP_STEP_TITLE,
  )
  toolLoopCtx.beginStep(undefined, undefined, { suppressToolLoopUi: true })

  const tools = filterToolsByAvailableSet(
    parentCtx.runtimeTools,
    parentCtx.opts.availableSet,
    parentCtx.opts.conversationId,
  )
  if (tools.length === 0) {
    toolLoopCtx.clearToolLoopOutputScope()
    return
  }

  const userContent = parentCtx.getLatestUserMessageContent()
  const threadTag = resolveEffectiveThreadTag(
    parentCtx.opts.conversationId,
    userContent,
  )

  reconcilePlanExecutionStateFromDisk(parentCtx)
  await maybeAutoActivatePlanMode(parentCtx)

  const recordingCtx: ToolResultRecordingCtx | undefined = parentCtx.opts
    .conversationId
    ? {
        conversationId: parentCtx.opts.conversationId,
        agentId: parentCtx.opts.agentId ?? '',
        stepId: TOOL_LOOP_STEP_ID,
        threadTag,
      }
    : undefined

  const bootstrapToolSet = buildAgentToolSet(
    tools,
    toolLoopCtx,
    parentCtx.opts.skillId,
  )

  const clientUi = parentCtx.opts.clientUiMessages
  const exitApprovalFinalized = await finalizeExitPlanModeApprovalResume({
    conversationId: parentCtx.opts.conversationId,
    clientUi,
    toolSet: bootstrapToolSet as Record<
      string,
      { execute?: (input: unknown) => Promise<unknown> }
    >,
    onUIMessageChunk: parentCtx.opts.onUIMessageChunk,
  })
  if (exitApprovalFinalized.handled) {
    parentCtx.hitlAwaitingApproval = false
    const outputText = exitApprovalFinalized.error
      ? exitApprovalFinalized.error
      : exitApprovalFinalized.output != null
        ? serializeForAgentCollect(exitApprovalFinalized.output, {
            toolName: 'exit_plan_mode',
          })
        : 'Plan approved. Executing tasks from the approved plan.'
    parentCtx.appendAssistantTurn(outputText)
    publishVisibleToolLoopAttachments(parentCtx)
    parentCtx.recordStepOutput(
      TOOL_LOOP_STEP_ID,
      TOOL_LOOP_STEP_TITLE,
      outputText,
      outputText,
    )
    toolLoopCtx.clearToolLoopOutputScope()
    if (!exitApprovalFinalized.error && exitApprovalFinalized.output != null) {
      await runApprovedPlanTodoForeach(parentCtx)
    }
    return
  }

  if (
    isPlanExecutionActive(parentCtx.opts.conversationId) &&
    clientUiIndicatesExitPlanModeApprovalResume(clientUi) &&
    shouldRunPlanTodoForeach(parentCtx as AgentFlowContext)
  ) {
    parentCtx.hitlAwaitingApproval = false
    await runApprovedPlanTodoForeach(parentCtx)
    return
  }

  const instructionsRaw = assembleInstructions(toolLoopCtx, 'toolLoop')
  let instructions = await appendLinkedMarkdownReferenceSections(
    instructionsRaw,
    toolLoopCtx,
  )

  // Detect topic switch early so we can embed the focus directive before
  // creating the agent (topicSwitch is also used below when building messages).
  const topicSwitch = parentCtx.opts.conversationId
    ? detectTopicSwitch(parentCtx.opts.conversationId, threadTag)
    : { switched: false }

  if (topicSwitch.switched) {
    const focusDirective =
      `\n\n---\nNEW TOPIC: The user has changed the subject (from "${topicSwitch.previousTag}" to "${threadTag}"). ` +
      `All prior tasks are finished. Do NOT redo, revisit, or continue any previous work. ` +
      `Focus exclusively on the user's current request.\n---`
    instructions = instructions + focusDirective
  }

  const allToolNames = Object.keys(bootstrapToolSet)
  const planModePrepareStep = createPrepareStepFromInjectors(
    toolLoopCtx,
    allToolNames,
  )

  const windowOldestTs = resolveWindowOldestTimestamp(clientUi)
  const isApprovalResume = clientUiIndicatesToolApprovalResume(clientUi)
  if (isApprovalResume) {
    parentCtx.agentFlow.toolLoopIteration += 1
  }

  const maxAttempts = resolveTodoMaxRetries(parentCtx.opts.todoMaxRetries)
  let lastRetryContext = ''
  let collected: Awaited<ReturnType<typeof streamAgent>> | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const guardrails = new ToolGuardrailController()
    const haltCtrl = new AbortController()
    parentCtx.opts.abortSignal?.addEventListener(
      'abort',
      () => haltCtrl.abort('parent-abort'),
      { once: true },
    )

    const toolSet = buildAgentToolSet(
      tools,
      toolLoopCtx,
      parentCtx.opts.skillId,
      { guardrails, haltCtrl, recordingCtx },
    )

    const attemptChoice = parentCtx.resolveToolLoopExecutionChoice(attempt > 1)
    const agent = createAgent({
      name: 'tool-loop',
      model: parentCtx.resolveToolLoopExecutionModel(attempt > 1),
      tools: toolSet,
      instructions,
      stopWhen: resolveToolLoopStopWhen(parentCtx),
      maxTurns: resolveToolLoopMaxTurns(parentCtx),
      abortSignal: haltCtrl.signal,
      prepareStep: planModePrepareStep,
      provider: attemptChoice.provider,
      modelId: attemptChoice.model,
      providerOptions: attemptChoice.providerOptions,
    })

    const attemptUserContent = appendStandaloneRetryToUserContent(
      userContent,
      attempt,
      maxAttempts,
      lastRetryContext,
    )

    let loopMessages: ModelMessage[] = [
      { role: 'user', content: attemptUserContent },
    ]

    if (topicSwitch.switched) {
      stepLog.info('Topic switch detected — resetting to current message only', {
        previousTag: topicSwitch.previousTag,
        currentTag: threadTag,
      })
      loopMessages = sanitizeModelMessagesForAgent(loopMessages)
      parentCtx.opts.clientUiMessages = undefined
    } else if (isApprovalResume && clientUi?.length && attempt === 1) {
      try {
        const uiForLoop = sliceClientUiMessagesForToolApprovalContinuation(
          clientUi,
          { multiTodoPlan: false },
        )
        loopMessages = await buildAgentModelMessages({
          toolSet,
          fallbackUserContent: attemptUserContent,
          clientUiMessages: uiForLoop,
        })
      } catch (err) {
        stepLog.error('buildAgentModelMessages failed for standalone tool loop', {
          conversationId: parentCtx.opts.conversationId,
          err,
        })
        throw err
      }
      parentCtx.opts.clientUiMessages = undefined
    } else if (!topicSwitch.switched && attempt === 1) {
      loopMessages = sanitizeModelMessagesForAgent(
        mapAgentMessagesToModelMessages(parentCtx.currentMessages),
      )
    } else if (attempt > 1) {
      loopMessages = sanitizeModelMessagesForAgent([
        { role: 'user', content: attemptUserContent },
      ])
    }

    const prunedMessages = await prepareLoopMessages(parentCtx, loopMessages, {
      threadTag,
      windowOldestTs: windowOldestTs,
      loopStep: parentCtx.agentFlow.toolLoopIteration,
    })

    try {
      collected = await streamAgent({
        agent,
        messages: prunedMessages,
        toolRunCtx: toolLoopCtx,
        onChunk: (chunk) => parentCtx.emitBatchToolLoopStepProgress(chunk),
        onUIMessageChunk: parentCtx.opts.onUIMessageChunk,
        usageMeta: {
          opts: parentCtx.opts,
          providers: parentCtx.providers,
          stepId: TOOL_LOOP_STEP_ID,
          source: 'toolLoop',
        },
        debugCall: {
          instructions,
          toolNames: Object.keys(toolSet),
          label: `toolLoop-standalone-${attempt}`,
        },
      })

      if (!collected.awaitingToolApproval) {
        collected = await nudgeExitPlanModeIfNeeded({
          parentCtx,
          toolLoopCtx,
          collected,
          loopMessages: prunedMessages,
          toolSet: toolSet as Record<string, unknown>,
          instructions,
          haltCtrl: haltCtrl.signal,
          streamParams: {
            onChunk: (chunk) => parentCtx.emitBatchToolLoopStepProgress(chunk),
            onUIMessageChunk: parentCtx.opts.onUIMessageChunk,
            usageMeta: {
              opts: parentCtx.opts,
              providers: parentCtx.providers,
              stepId: TOOL_LOOP_STEP_ID,
              source: 'toolLoop',
            },
          },
        })
      }
    } catch (error) {
      toolLoopCtx.clearToolLoopOutputScope()
      if (isAbortError(error)) throw error
      logLlmError('Standalone tool loop LLM call failed', error, {
        path: 'runStandaloneAgent',
        attempt,
        maxAttempts,
        conversationId: parentCtx.opts.conversationId,
        agentId: parentCtx.opts.agentId,
        provider: parentCtx.opts.provider,
        model: parentCtx.opts.model,
      })
      const classifiedError = classifyLlmError(error)
      const detail = error instanceof Error ? error.message : String(error)
      const action = resolveToolLoopFallback({
        failureKind: 'execution_error',
        fallbackPlan: 'retry',
        attempt,
        maxAttempts,
        failureSummary: detail,
        classifiedError,
      })
      if (action.type === 'retry_attempt') {
        lastRetryContext = `${RETRY_CONTEXT.FAILURE_REASON} ${detail}\n\n${RETRY_CONTEXT.PREVIOUS_OUTPUT}\n`
        parentCtx.emitBatchToolLoopStepProgress(
          `\n⚠️ Tool loop attempt ${attempt} failed: ${detail}\n🔄 Retrying (${attempt + 1}/${maxAttempts})...\n\n`,
        )
        continue
      }
      parentCtx.recordStepOutput(
        TOOL_LOOP_STEP_ID,
        TOOL_LOOP_STEP_TITLE,
        '',
        '',
        { attempt, status: 'failed' },
        undefined,
        STEP_ERRORS.EXECUTION_ERROR.replace('{detail}', detail),
      )
      parentCtx.emitBatchToolLoopStepProgress(
        formatLlmErrorProgressChunk(error, 'toolLoop'),
      )
      return
    } finally {
      toolLoopCtx.clearToolLoopOutputScope()
    }

    if (!collected) return

    if (collected.awaitingToolApproval) {
      break
    }

    const failureKind = detectStandaloneStreamFailure(collected, haltCtrl)
    if (!failureKind) {
      break
    }

    const failureSummary =
      failureKind === 'no_output'
        ? STEP_ERRORS.NO_OUTPUT
        : 'Tool loop halted by guardrails.'
    const action = resolveToolLoopFallback({
      failureKind,
      fallbackPlan: 'retry',
      attempt,
      maxAttempts,
      failureSummary,
    })
    if (action.type === 'retry_attempt') {
      lastRetryContext = `${RETRY_CONTEXT.FAILURE_REASON} ${action.reason}\n\n${RETRY_CONTEXT.PREVIOUS_OUTPUT}\n${collected.text}`
      parentCtx.emitBatchToolLoopStepProgress(
        `\n⚠️ Tool loop attempt ${attempt} failed: ${failureSummary}\n🔄 Retrying (${attempt + 1}/${maxAttempts})...\n\n`,
      )
      continue
    }

    parentCtx.recordStepOutput(
      TOOL_LOOP_STEP_ID,
      TOOL_LOOP_STEP_TITLE,
      collected.text,
      collected.text,
      { attempt, status: 'failed', failureKind },
    )
    parentCtx.emitBatchToolLoopStepProgress(
      `\n\n⚠ **Tool loop failed**: ${failureSummary}\n\n`,
    )
    return
  }

  if (!collected) {
    return
  }

  if (collected.awaitingToolApproval) {
    parentCtx.hitlAwaitingApproval = true
    parentCtx.setHitlPausedAtStage(TOOL_LOOP_STEP_ID)
    publishVisibleToolLoopAttachments(parentCtx)
    parentCtx.updateStepOutput(
      TOOL_LOOP_STEP_ID,
      TOOL_LOOP_STEP_TITLE,
      collected.text,
      collected.text,
    )
    savePendingApprovalState(parentCtx)
    return
  }

  parentCtx.hitlAwaitingApproval = false
  parentCtx.appendAssistantTurn(collected.text)
  publishVisibleToolLoopAttachments(parentCtx)
  parentCtx.recordStepOutput(
    TOOL_LOOP_STEP_ID,
    TOOL_LOOP_STEP_TITLE,
    collected.text,
    collected.text,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-todo tool-loop execution (called by ForEachItemOrchestrator)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a single todo item using the tool-loop agent.
 * Loads references, builds system/user prompts, runs the agent, returns raw output.
 * Does NOT handle retry, verification, or HITL form orchestration.
 */
export async function executeTodoToolLoop(
  ctx: AgentStepContext,
  params: ExecuteTodoParams,
): Promise<TodoExecutionResult> {
  const {
    todoItem,
    todoIndexInPlan,
    plan,
    attempt,
    maxAttempts,
    lastRetryContext,
    route,
    collectedFormJson,
    stepProgressCtx,
  } = params

  const plannedTodo = resolvePlannedTodoItem(
    plan,
    todoItem,
    todoIndexInPlan,
  ) as TodoItem
  const progressSink = stepProgressCtx ?? ctx
  const reference_doc = plannedTodo.reference_doc ?? []
  const formValuesCollected = Boolean(collectedFormJson)
  const stepGoal = buildTodoStepGoalForExecution(
    plan,
    plannedTodo,
    todoIndexInPlan,
    formValuesCollected,
  )

  const toolRunCtx = ctx.createStepContext(
    TOOL_LOOP_STEP_ID,
    formatToolLoopTaskStepTitle(todoItem.id, attempt),
  )
  toolRunCtx.beginStep(
    undefined,
    undefined,
    { todoId: plannedTodo.id, attempt, planIndex: todoIndexInPlan },
    stepGoal,
  )

  const activeTodoContent =
    plannedTodo.name?.trim() || plannedTodo.description?.trim() || ''
  setActivePlanTodoContent(activeTodoContent)

  const skillId = toolRunCtx.opts.skillId!
  const tools = filterToolsByAvailableSet(
    toolRunCtx.runtimeTools,
    toolRunCtx.opts.availableSet,
    toolRunCtx.opts.conversationId,
  )

  const guardrails = new ToolGuardrailController()
  const haltCtrl = new AbortController()
  toolRunCtx.opts.abortSignal?.addEventListener(
    'abort',
    () => haltCtrl.abort('parent-abort'),
    { once: true },
  )

  const todoThreadTag = resolveEffectiveThreadTag(
    toolRunCtx.opts.conversationId,
    [
      toolRunCtx.getLatestUserMessageContent(),
      plannedTodo.name,
      plannedTodo.description ?? '',
    ].join(' '),
  )

  const todoRecordingCtx: ToolResultRecordingCtx | undefined = toolRunCtx.opts
    .conversationId
    ? {
        conversationId: toolRunCtx.opts.conversationId,
        agentId: toolRunCtx.opts.agentId ?? '',
        stepId: `${TOOL_LOOP_STEP_ID}:${plannedTodo.id}`,
        threadTag: todoThreadTag,
      }
    : undefined

  const toolSet = buildAgentToolSet(tools, toolRunCtx, skillId, {
    guardrails,
    haltCtrl,
    recordingCtx: todoRecordingCtx,
  })

  const executorReferenceDocs = reference_doc.filter(
    (d) => !toolRunCtx.form.referenceDocIsCollectFormSchemaDoc(d, plannedTodo),
  )
  const explicitScripts = resolveTodoReferenceScripts(
    plan,
    plannedTodo,
    todoIndexInPlan,
  )
  const scriptRows =
    explicitScripts.length > 0
      ? explicitScripts
      : inferReferenceScriptsFromText(
          [
            plannedTodo.name,
            plannedTodo.description,
            plannedTodo.success_criteria,
          ].join('\n'),
        )
  const reference_scripts = scriptRows.map((s) =>
    toolRunCtx.references.scriptFromPlain(s),
  )

  try {
    const referencesContent = await loadReferenceContent(
      executorReferenceDocs,
      reference_scripts,
      toolRunCtx,
      ctx,
    )
    const skipExpandHrefKeys = collectPlannedReferenceHrefKeys(
      toolRunCtx.references,
      executorReferenceDocs,
      reference_scripts,
    )

    const multiTodoPlan = (plan?.todoList?.length ?? 0) > 1
    const stepUserPrompt = buildTodoStepUserPrompt(
      plan,
      stepGoal,
      plannedTodo.id,
      attempt,
      maxAttempts,
      lastRetryContext,
      collectedFormJson,
    )

    const instructions = await buildTodoExecutorInstructions(
      toolRunCtx,
      plannedTodo,
      stepGoal,
      attempt,
      maxAttempts,
      lastRetryContext,
      referencesContent,
      skipExpandHrefKeys,
      route,
    )

    const toolLoopChoice = toolRunCtx.resolveToolLoopExecutionChoice(
      params.useRecoveryLlm === true,
    )
    const agent = createAgent({
      name: 'skills-tool-loop',
      model: toolRunCtx.resolveToolLoopExecutionModel(
        params.useRecoveryLlm === true,
      ),
      tools: toolSet,
      instructions,
      stopWhen: resolveToolLoopStopWhen(toolRunCtx),
      maxTurns: resolveToolLoopMaxTurns(toolRunCtx),
      abortSignal: haltCtrl.signal,
      provider: toolLoopChoice.provider,
      modelId: toolLoopChoice.model,
      providerOptions: toolLoopChoice.providerOptions,
    })

    let rawMessages = await buildLoopMessagesForRoute(route, {
      toolRunCtx,
      toolSet,
      todoItem: plannedTodo,
      todoIndexInPlan,
      stepUserPrompt,
      multiTodoPlan,
    })

    const messages = await prepareLoopMessages(toolRunCtx, rawMessages, {
      threadTag: todoThreadTag,
      clientUiMessages: toolRunCtx.opts.clientUiMessages,
      logContext: { todoId: plannedTodo.id },
    })

    const collected = await streamAgent({
      agent,
      messages,
      toolRunCtx,
      onChunk: (chunk) => progressSink.emitStepProgress(chunk),
      onUIMessageChunk: toolRunCtx.opts.onUIMessageChunk,
      usageMeta: {
        opts: toolRunCtx.opts,
        providers: toolRunCtx.providers,
        stepId: toolRunCtx.stepId,
        source: 'skillsAgent',
      },
      debugCall: {
        instructions,
        toolNames: Object.keys(toolSet),
        label: `toolLoop-todo-${plannedTodo.id}`,
      },
    })

    if (collected.awaitingToolApproval) {
      toolRunCtx.hitlAwaitingApproval = true
      toolRunCtx.setHitlPausedAtStage(TOOL_LOOP_STEP_ID)
      toolRunCtx.updateStepOutput(
        TOOL_LOOP_STEP_ID,
        toolRunCtx.title,
        collected.text,
        collected.text,
        { todoId: todoItem.id, attempt, pendingApproval: true },
        stepGoal,
      )
      savePendingApprovalState(toolRunCtx, todoIndexInPlan, todoItem.id)
      return { output: collected.text, awaitingToolApproval: true }
    }

    toolRunCtx.hitlAwaitingApproval = false
    const output = collected.text.trim()

    if (
      haltCtrl.signal.aborted &&
      String(haltCtrl.signal.reason) === 'guardrail-halt'
    ) {
      toolRunCtx.recordStepOutput(
        TOOL_LOOP_STEP_ID,
        toolRunCtx.title,
        output,
        output,
        { todoId: todoItem.id, attempt, status: 'failed', guardrailHalt: true },
        stepGoal,
      )
      return {
        output,
        awaitingToolApproval: false,
        failureKind: 'guardrail_halt',
      }
    }

    toolRunCtx.recordStepOutput(
      TOOL_LOOP_STEP_ID,
      toolRunCtx.title,
      output,
      output,
      { todoId: todoItem.id, attempt },
      stepGoal,
    )

    if (!output) {
      return {
        output: '',
        awaitingToolApproval: false,
        failureKind: 'no_output',
      }
    }

    return { output, awaitingToolApproval: false }
  } catch (error) {
    logLlmError('executeTodoToolLoop LLM call failed', error, {
      path: 'executeTodoToolLoop',
      todoId: todoItem.id,
      attempt,
      route,
      conversationId: toolRunCtx.opts.conversationId,
      stepId: toolRunCtx.stepId,
      provider: toolRunCtx.opts.provider,
      model: toolRunCtx.opts.model,
    })
    if (isAbortError(error)) throw error
    const classifiedError = classifyLlmError(error)
    const detail = error instanceof Error ? error.message : String(error)
    toolRunCtx.recordStepOutput(
      TOOL_LOOP_STEP_ID,
      toolRunCtx.title,
      '',
      '',
      { todoId: todoItem.id, attempt, status: 'failed' },
      stepGoal,
      STEP_ERRORS.EXECUTION_ERROR.replace('{detail}', detail),
    )
    progressSink.emitStepProgress(formatLlmErrorProgressChunk(error, 'toolLoop'))
    return {
      output: '',
      awaitingToolApproval: false,
      failureKind: 'execution_error',
      classifiedError,
    }
  } finally {
    clearActivePlanTodoContent()
    toolRunCtx.clearToolLoopOutputScope()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-todo internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildTodoStepUserPrompt(
  plan: PlanningResult | undefined,
  stepGoal: string,
  planStepId: number,
  attempt: number,
  maxAttempts: number,
  lastRetryContext: string,
  collectedFormJson?: string,
): string {
  const primary =
    stepGoal !== '(no task details)'
      ? stepGoal
      : plan?.finalGoal?.trim() || `Execute plan step ${planStepId}`

  let prompt: string
  if (attempt === 1) {
    prompt = primary
  } else {
    prompt = `${primary}\n\n${RETRY_CONTEXT.RETRY_ATTEMPT.replace('{attempt}', String(attempt)).replace('{maxAttempts}', String(maxAttempts))}:\n\n${lastRetryContext}\n\n${SKILLS_TOOL_EXECUTION_LLM.RETRY_STEP_USER_SUFFIX}`
  }

  if (collectedFormJson) {
    prompt += `\n\nThe user has submitted the following form values. Use these values as parameters when calling the appropriate tool.\n\n${SKILLS_TOOL_EXECUTION_LLM.FORM_VALUES_HEADER}\n${collectedFormJson}\n\n${SKILLS_TOOL_EXECUTION_LLM.FORM_VALUES_FOOTER}`
  }

  return prompt
}

async function buildTodoExecutorInstructions(
  toolRunCtx: AgentStepContext,
  todoItem: TodoItem,
  stepGoal: string,
  attempt: number,
  maxAttempts: number,
  lastRetryContext: string,
  referencesContent: string,
  skipExpandHrefKeys: Set<string>,
  route: 'normal' | 'tool-approval' | 'form-submit',
): Promise<string> {
  const previousStepBlock =
    route === 'tool-approval'
      ? toolRunCtx.renderPreviousToolSkillStepsSummary(todoItem.id)
      : toolRunCtx.renderPreviousToolSkillStepBlock()

  let built = assembleInstructions(toolRunCtx, 'todoExecution', {
    todo: {
      stepGoal,
      attempt,
      maxAttempts,
      lastRetryContext,
      previousStepBlock: previousStepBlock ?? '',
    },
  })

  if (referencesContent.trim()) {
    built += `\n\n${SKILLS_TOOL_EXECUTION_LLM.REFERENCE_MATERIALS_HEADER}\n${referencesContent}`
  }

  const instructionsStr = resolveFlowStepExecutorInstructions(
    toolRunCtx.flowStepConfig,
    built,
  )

  return appendLinkedMarkdownReferenceSections(
    instructionsStr,
    toolRunCtx,
    { skipExpandHrefKeys },
  )
}

async function loadReferenceContent(
  docs: ReferenceDoc[],
  scripts: ReferenceScript[],
  toolRunCtx: AgentStepContext,
  parentCtx: AgentStepContext,
): Promise<string> {
  const sandboxRoot = toolRunCtx.sandbox.getRoot() ?? '/'
  const loadOpts = { sandboxRoot, abortSignal: toolRunCtx.opts.abortSignal }

  const [docParts, scriptParts] = await Promise.all([
    Promise.all(
      docs.map(async (doc) => {
        const d = parentCtx.references.ensureReferenceDoc(
          doc as ReferenceDoc | Record<string, unknown>,
        )
        const loaded = await d.loadContent(loadOpts)
        if (!loaded.ok) return null
        return `${REFERENCE_CONTENT_LABELS.DOC_PREFIX} ${referenceDocBasename(d.reference_url)}\n\n${loaded.body}`
      }),
    ),
    Promise.all(
      scripts.map(async (script) => {
        const s = parentCtx.references.ensureReferenceScript(
          script as ReferenceScript | Record<string, unknown>,
        )
        const loaded = await s.loadContent(loadOpts)
        if (loaded.ok === false) {
          return REFERENCE_CONTENT_LABELS.SCRIPT_LOAD_ERROR.replace(
            '{url}',
            s.reference_url,
          )
            .replace('{type}', s.script_type)
            .replace('{error}', loaded.error)
        }
        const runBlock = buildRunScriptInstruction(
          s.script_type === 'node'
            ? 'javascript'
            : (s.script_type as 'bash' | 'python' | 'nodejs'),
          loaded.body,
        )
        return [
          REFERENCE_CONTENT_LABELS.SCRIPT_HEADER.replace(
            '{type}',
            s.script_type,
          ),
          REFERENCE_CONTENT_LABELS.SCRIPT_PATH.replace(
            '{url}',
            s.reference_url,
          ),
          '',
          runBlock,
        ].join('\n')
      }),
    ),
  ])

  return [...docParts, ...scriptParts].filter(Boolean).join('\n\n')
}

function buildLoopMessagesForNormalStep(
  stepUserPrompt: string,
): ModelMessage[] {
  return [{ role: 'user', content: stepUserPrompt }]
}

async function buildLoopMessagesForToolApprovalResume(
  toolRunCtx: AgentStepContext,
  toolSet: Record<string, unknown>,
  stepUserPrompt: string,
  multiTodoPlan: boolean,
  todoIndexInPlan: number,
  todoId: number,
): Promise<ModelMessage[]> {
  const rawUi = toolRunCtx.opts.clientUiMessages
  if (!rawUi?.length) {
    stepLog.warn(
      'Tool approval resume without clientUiMessages; using step prompt only',
      { todoId },
    )
    return buildLoopMessagesForNormalStep(stepUserPrompt)
  }

  try {
    const uiForLoop = sliceClientUiMessagesForToolApprovalContinuation(rawUi, {
      multiTodoPlan,
    })
    const messages = await buildAgentModelMessages({
      toolSet,
      fallbackUserContent: stepUserPrompt,
      clientUiMessages: uiForLoop,
      stepScopedUserOnly: multiTodoPlan,
    })
    toolRunCtx.opts.clientUiMessages = undefined
    if (toolRunCtx.approvalResumeTodoIndex === todoIndexInPlan) {
      toolRunCtx.approvalResumeTodoIndex = undefined
    }
    return messages
  } catch (err) {
    stepLog.error(
      'buildLoopMessagesForToolApprovalResume failed; falling back to step prompt',
      {
        todoId,
        multiTodoPlan,
        conversationId: toolRunCtx.opts.conversationId,
        err,
      },
    )
    return buildLoopMessagesForNormalStep(stepUserPrompt)
  }
}

async function buildLoopMessagesForFormSubmitResume(
  toolRunCtx: AgentStepContext,
  toolSet: Record<string, unknown>,
  stepUserPrompt: string,
): Promise<ModelMessage[]> {
  const rawUi = toolRunCtx.opts.clientUiMessages
  if (!rawUi?.length) {
    return [{ role: 'user', content: stepUserPrompt }]
  }

  try {
    // trailingUserContent marks form-submit style replay: incomplete
    // approval-* tool UI parts are dropped before convert, and the sanitizer
    // strips any remaining unanswered tool_calls ahead of the step prompt.
    const messages = await buildAgentModelMessages({
      toolSet,
      fallbackUserContent: stepUserPrompt,
      clientUiMessages: rawUi,
      trailingUserContent: stepUserPrompt,
    })
    toolRunCtx.opts.clientUiMessages = undefined
    return messages
  } catch (err) {
    stepLog.error(
      'buildLoopMessagesForFormSubmitResume failed; falling back to step prompt',
      {
        conversationId: toolRunCtx.opts.conversationId,
        err,
      },
    )
    return [{ role: 'user', content: stepUserPrompt }]
  }
}

async function buildLoopMessagesForRoute(
  route: 'normal' | 'tool-approval' | 'form-submit',
  args: {
    toolRunCtx: AgentStepContext
    toolSet: Record<string, unknown>
    todoItem: TodoItem
    todoIndexInPlan: number
    stepUserPrompt: string
    multiTodoPlan: boolean
  },
): Promise<ModelMessage[]> {
  const {
    toolRunCtx,
    toolSet,
    todoItem,
    todoIndexInPlan,
    stepUserPrompt,
    multiTodoPlan,
  } = args

  switch (route) {
    case 'normal':
      return buildLoopMessagesForNormalStep(stepUserPrompt)
    case 'tool-approval':
      return buildLoopMessagesForToolApprovalResume(
        toolRunCtx,
        toolSet,
        stepUserPrompt,
        multiTodoPlan,
        todoIndexInPlan,
        todoItem.id,
      )
    case 'form-submit':
      return buildLoopMessagesForFormSubmitResume(
        toolRunCtx,
        toolSet,
        stepUserPrompt,
      )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Expression-based tool-loop step definition (pipeline runner)
// ─────────────────────────────────────────────────────────────────────────────

class ToolLoopStepDefinition extends StepExpressionDefinitionBase {
  readonly id = TOOL_LOOP_STEP_ID
  readonly title = TOOL_LOOP_STEP_TITLE

  shouldRun(run: StepRunContext): boolean {
    return toolLoopStageShouldRun(run.flow)
  }

  protected defaultInstruction(ctx: AgentStepContext): string {
    return assembleInstructions(ctx, 'toolLoop')
  }

  buildUserPrompt(ctx: AgentStepContext): string {
    return ctx.getLatestUserMessageContent()
  }

  async execute(ctx: AgentStepContext): Promise<void> {
    const mergedPlan = this.buildPlan(ctx)
    const override = ctx.flowStepConfig?.expressionPlan
    if (override && expressionPlanIsRunnable(override)) {
      const plan = mergeExpressionPlans(mergedPlan, override)
      await runExpressionPlanOnContext(
        ctx,
        TOOL_LOOP_STEP_ID,
        TOOL_LOOP_STEP_TITLE,
        plan,
      )
      return
    }
    await runStandaloneAgent(ctx)
  }
}

/** Run tool-loop stage via expression hooks (expression plan or tool-loop {@link Agent}). */
export async function executeToolLoopStage(
  ctx: AgentStepContext,
): Promise<void> {
  await new ToolLoopStepDefinition().execute(ctx)
}
