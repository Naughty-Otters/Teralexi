import { type ModelMessage } from '@teralexi-ai'
import { buildRunScriptInstruction } from '@toolSet/shell-command'
import {
  buildAgentModelMessages,
  sliceClientUiMessagesForToolApprovalContinuation,
} from '../utils'
import { inferReferenceScriptsFromText } from '../utils/agent-parsing'
import {
  resolvePlannedTodoItem,
  resolveTodoReferenceScripts,
} from '../utils/planning-fields'
import type { AgentStepContext } from '../context'
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
import { ToolGuardrailController } from './tool-guardrails'
import type { ToolResultRecordingCtx } from './tool-result-recorder'
import { buildAgentToolSet } from './tool-loop-toolset'
import {
  getMidLoopBudgetState,
  recoverFromContextOverflow,
  resetOverflowRecoveryForStream,
} from './mid-loop-budget'
import { prepareLoopMessages } from './prepare-loop-messages'
import { resolveEffectiveThreadTag } from './thread-context-builder'
import {
  appendLinkedMarkdownReferenceSections,
  collectPlannedReferenceHrefKeys,
} from '../steps/step-reference-link-expand'
import {
  assembleInstructions,
  createPrepareStepFromInjectors,
} from '../injection'
import {
  filterToolsByAvailableSet,
  savePendingApprovalState,
  stepLog,
  createAgent,
  streamAgent,
  buildTodoStepGoalForExecution,
  isAbortError,
} from '../steps/step-helpers'
import {
  TOOL_LOOP_STEP_ID,
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
import { isContextOverflowClassifiedError } from './tool-loop-fallback'
import {
  resolveToolLoopMaxTurns,
  resolveToolLoopStopWhen,
} from './tool-loop-expr'

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
  resetOverflowRecoveryForStream(toolRunCtx)
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
    const todoPrepareStep = createPrepareStepFromInjectors(
      toolRunCtx,
      Object.keys(toolSet),
      'todoExecution',
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
      prepareStep: todoPrepareStep,
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

    let collected: Awaited<ReturnType<typeof streamAgent>>
    try {
      collected = await streamAgent({
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
    } catch (streamError) {
      if (isAbortError(streamError)) throw streamError
      const classified = classifyLlmError(streamError)
      if (
        isContextOverflowClassifiedError(classified) &&
        !getMidLoopBudgetState(toolRunCtx).overflowRecoveryUsed
      ) {
        const recovered = await recoverFromContextOverflow(
          toolRunCtx,
          messages,
          { currentThreadTag: todoThreadTag },
        )
        if (recovered) {
          progressSink.emitStepProgress(
            `\n⚠️ Context overflow — compacting history and retrying once...\n\n`,
          )
          collected = await streamAgent({
            agent,
            messages: recovered,
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
              label: `toolLoop-todo-${plannedTodo.id}-overflow-recovery`,
            },
          })
        } else {
          throw streamError
        }
      } else {
        throw streamError
      }
    }

    // Nested invoke_agents may set HITL flags via mergeChildHitlPause while this
    // stream itself did not emit a tool-approval-request.
    const nestedHitlPaused =
      toolRunCtx.hitlAwaitingApproval ||
      toolRunCtx.hitlAwaitingFormData ||
      toolRunCtx.hitlAwaitingManualIntervention

    if (collected.awaitingToolApproval || nestedHitlPaused) {
      if (collected.awaitingToolApproval) {
        toolRunCtx.hitlAwaitingApproval = true
      }
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
