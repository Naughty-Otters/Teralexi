import { type ModelMessage } from '@teralexi-ai'
import { resolveTodoMaxRetries } from '@shared/agent/tool-loop'
import {
  buildAgentModelMessages,
  mapAgentMessagesToModelMessages,
  sanitizeModelMessagesForAgent,
  sliceClientUiMessagesForToolApprovalContinuation,
  clientUiIndicatesToolApprovalResume,
} from '../utils'
import type { AgentFlowContext, AgentStepContext } from '../context'
import {
  buildAgentToolSet,
  publishToolLoopAttachmentsForParent,
} from './tool-loop-toolset'
import {
  getMidLoopBudgetState,
  recoverFromContextOverflow,
  resetOverflowRecoveryForStream,
} from './mid-loop-budget'
import { prepareLoopMessages } from './prepare-loop-messages'
import {
  detectTopicSwitch,
  resolveEffectiveThreadTag,
  resolveWindowOldestTimestamp,
} from './thread-context-builder'
import { ToolGuardrailController } from './tool-guardrails'
import type { ToolResultRecordingCtx } from './tool-result-recorder'
import {
  assembleInstructions,
  createPrepareStepFromInjectors,
} from '../injection'
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
import { reconcilePlanExecutionStateFromDisk } from '../coding/plan-mode-execution-bridge'
import {
  filterToolsByAvailableSet,
  savePendingApprovalState,
  stepLog,
  createAgent,
  streamAgent,
  isAbortError,
} from '../steps/step-helpers'
import {
  TOOL_LOOP_STEP_ID,
  TOOL_LOOP_STEP_TITLE,
} from '../constants/step-ids'
import { RETRY_CONTEXT, STEP_ERRORS } from '../constants/pipeline'
import { SKILLS_TOOL_EXECUTION_LLM } from '../constants/skills-tool-llm'
import { classifyLlmError } from '../providers/error-classifier'
import { logLlmError, formatLlmErrorProgressChunk } from '../llm/log-llm-error'
import {
  isContextOverflowClassifiedError,
  resolveToolLoopFallback,
  type ToolLoopFailureKind,
} from './tool-loop-fallback'
import {
  resolveToolLoopMaxTurns,
  resolveToolLoopStopWhen,
} from './tool-loop-expr'
import { appendLinkedMarkdownReferenceSections } from '../steps/step-reference-link-expand'

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
export async function runStandaloneAgent(parentCtx: AgentStepContext): Promise<void> {
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
  let overflowRecoveryMessages: ModelMessage[] | null = null
  resetOverflowRecoveryForStream(parentCtx)

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

    if (overflowRecoveryMessages) {
      loopMessages = overflowRecoveryMessages
      overflowRecoveryMessages = null
    } else if (topicSwitch.switched) {
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

      if (
        isContextOverflowClassifiedError(classifiedError) &&
        !getMidLoopBudgetState(parentCtx).overflowRecoveryUsed
      ) {
        const recovered = await recoverFromContextOverflow(
          parentCtx,
          prunedMessages,
          { currentThreadTag: threadTag },
        )
        if (recovered) {
          overflowRecoveryMessages = recovered
          parentCtx.emitBatchToolLoopStepProgress(
            `\n⚠️ Context overflow — compacting history and retrying once...\n\n`,
          )
          attempt -= 1
          continue
        }
      }

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
