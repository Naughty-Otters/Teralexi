import type { AgentStepContext } from '../../../context'
import type { PlanningResult, TodoItem } from '../../../types'
import { latestThinkingStepData } from '../../../expr/thinking-utils'
import {
  FOREACH_ITEM_STEP_ID,
  FOREACH_ITEM_STEP_TITLE,
  TOOL_LOOP_STEP_ID,
  TOOL_LOOP_STEP_TITLE,
} from '../../../constants/step-ids'
import {
  RETRY_CONTEXT,
  STEP_ERRORS,
  TODO_STATUS_LINES,
} from '../../../constants/pipeline'
import { clientUiIndicatesToolApprovalResume } from '../../../utils'
import { enrichTodoItemsWithInferredScripts } from '../../../utils/agent-parsing'
import { resolvePlannedTodoItem } from '../../../utils/planning-fields'
import {
  buildTodoStepGoalFromPlan,
  savePendingApprovalState,
} from '../../step-helpers'
import {
  executeTodoToolLoop,
  publishToolLoopAttachmentsForParent,
} from '../../../expr/tool-loop-expr'
import {
  resolveToolLoopFallback,
  type ToolLoopAttemptResult,
  type ToolLoopFailureKind,
} from '../../../expr/tool-loop-fallback'
import { resolveTodoMaxRetries } from '@shared/agent/tool-loop'
import { buildExecutionOutputForVerification } from '../../build-execution-output-for-verification'
import { verifyTodoResult } from '../../todo-execution-types'
import { runTodoVerifyCommand } from '../../todo-verify-command'
import {
  shouldRunPlanTodoForeach,
  persistPlanModeTodosFromPipeline,
  planModeTodoItemsFromContext,
  reconcilePlanExecutionStateFromDisk,
  shouldSkipPlanModeTodoItem,
  isPlanModeTodosAllDoneOnDisk,
  syncPlanModeBatchTodosFromDisk,
} from '../../../coding/plan-mode-execution-bridge'
import {
  defaultPlanningTodoItems,
  isPlanModeTodosPreset,
  type ForEachItemhasTodoItemsPreset,
  type ForEachItemPlanModeTodosPreset,
} from '../../foreach-item-config'
import { runTodoItemPrelude } from '../prelude'
import type { ForEachItemItemResult, ForEachItemStrategy } from '../types'

type PlannedTodoPresetConfig =
  | ForEachItemhasTodoItemsPreset
  | ForEachItemPlanModeTodosPreset

function resolveTodosForConfig(
  ctx: AgentStepContext,
  config: PlannedTodoPresetConfig,
): TodoItem[] {
  if (isPlanModeTodosPreset(config)) {
    return planModeTodoItemsFromContext(ctx)
  }
  return defaultPlanningTodoItems(ctx)
}

function hasTodoItemsForConfig(
  ctx: AgentStepContext,
  config: PlannedTodoPresetConfig,
): boolean {
  if (isPlanModeTodosPreset(config)) {
    return shouldRunPlanTodoForeach(ctx)
  }
  const todos = defaultPlanningTodoItems(ctx)
  if (todos.length === 0) return false
  const hasToolWork = (ctx.executionSteps?.toolLoop?.tools?.length ?? 0) > 0
  return hasToolWork
}

type PlannedBatchState = {
  plan: PlanningResult
  todos: TodoItem[]
  startIndex: number
  toolLoopProgressCtx: AgentStepContext
  executionSummaries: string[]
}

export function createPlannedTodoStrategy(
  config: PlannedTodoPresetConfig,
): ForEachItemStrategy {
  let batch: PlannedBatchState | undefined
  const planModePreset = isPlanModeTodosPreset(config)

  return {
    shouldRun(ctx) {
      return hasTodoItemsForConfig(ctx, config)
    },

    shouldSkipItem(ctx, item, index) {
      if (!planModePreset) return false
      if (batch) {
        syncPlanModeBatchTodosFromDisk(ctx, batch.todos)
        const synced = batch.todos[index]
        if (synced && shouldSkipPlanModeTodoItem(synced)) return true
      }
      return shouldSkipPlanModeTodoItem(item)
    },

    async onBatchStart(ctx) {
      if (!hasTodoItemsForConfig(ctx, config)) return

      ctx.form.applyCollectFormResponsesToUiMessages()
      const todos = resolveTodosForConfig(ctx, config)
      if (todos.length === 0) return
      enrichTodoItemsWithInferredScripts(todos)

      const plan = ctx.stepOutputs.planning
      const thinking = latestThinkingStepData(ctx)
      const agentCall =
        !planModePreset &&
        (thinking?.execution_mode === 'agent_call' || !plan?.todoList?.length)
      const finalGoal =
        plan?.finalGoal?.trim() ||
        thinking?.goal?.trim() ||
        todos[0]?.name?.trim() ||
        'Execute approved plan'
      const planResult: PlanningResult = plan ?? {
        finalGoal,
        todoList: todos,
        expectations: [],
      }

      if (!planModePreset) {
        await ctx.sandbox.materializePlanningReferences(
          planResult,
          ctx.skillId,
        )
      }

      const foreachTitle = agentCall
        ? 'Executing'
        : ctx.flowStepConfig?.title?.trim() || FOREACH_ITEM_STEP_TITLE
      ctx.beginStep(
        FOREACH_ITEM_STEP_ID,
        foreachTitle,
        { todoCount: todos.length, executionMode: thinking?.execution_mode },
        undefined,
        agentCall ? thinking?.task?.trim() || finalGoal : undefined,
      )
      if (agentCall) {
        ctx.emitStepProgress(
          'Running tools for this request…\n\n',
          FOREACH_ITEM_STEP_ID,
        )
      }

      const toolLoopProgressCtx = ctx.createStepContext(
        TOOL_LOOP_STEP_ID,
        TOOL_LOOP_STEP_TITLE,
      )
      toolLoopProgressCtx.beginStep(undefined, undefined, {
        todoCount: todos.length,
      })

      const start =
        ctx.resumeTodoIndex ?? config.startIndex ?? 0
      if (typeof ctx.resumeTodoIndex === 'number') {
        const resumeTodo = todos[start]
        if (resumeTodo && resumeTodo.status !== 'completed') {
          resumeTodo.status = 'pending'
        }
      }
      ctx.resumeTodoIndex = undefined

      batch = {
        plan: planResult,
        todos,
        startIndex: start,
        toolLoopProgressCtx,
        executionSummaries: seedExecutionSummariesFromPlan(todos, start),
      }
    },

    resolveItems() {
      if (!batch) {
        return { items: [], startIndex: 0 }
      }
      return { items: batch.todos, startIndex: batch.startIndex }
    },

    itemTitle(_ctx, item, _index) {
      const todo = item as TodoItem
      return todo.name?.trim() || FOREACH_ITEM_STEP_TITLE
    },

    async runItem(flowCtx, item, index, stepCtx): Promise<ForEachItemItemResult> {
      if (!batch) return {}

      if (planModePreset) {
        syncPlanModeBatchTodosFromDisk(flowCtx, batch.todos)
        if (isPlanModeTodosAllDoneOnDisk(flowCtx)) {
          reconcilePlanExecutionStateFromDisk(flowCtx)
          return { stopBatch: true }
        }
        const synced = batch.todos[index]
        if (synced && shouldSkipPlanModeTodoItem(synced)) {
          return {}
        }
      }

      const todoItem = item as TodoItem
      const { plan, toolLoopProgressCtx } = batch

      const maxAttempts =
        todoItem.fallback_plan === 'retry'
          ? resolveTodoMaxRetries(stepCtx.opts.todoMaxRetries)
          : 1

      let solved = false
      let lastRetryContext = ''
      let lastFailureSummary = ''

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const result = await executeSingleTodoWithOrchestration(
          flowCtx,
          stepCtx,
          todoItem,
          plan,
          index,
          attempt,
          maxAttempts,
          lastRetryContext,
          toolLoopProgressCtx,
        )

        if (
          flowCtx.hitlAwaitingApproval ||
          flowCtx.hitlAwaitingFormData ||
          flowCtx.hitlAwaitingManualIntervention
        ) {
          return { paused: true }
        }

        if (result.solved) {
          solved = true
          batch.executionSummaries.push(
            TODO_STATUS_LINES.COMPLETED.replace(
              '{id}',
              String(todoItem.id),
            ).replace('{output}', result.output),
          )
          if (planModePreset) {
            persistPlanModeTodosFromPipeline(flowCtx, batch.todos)
          }
          break
        }

        lastFailureSummary = result.failureSummary
        const failureKind: ToolLoopFailureKind =
          result.failureKind ?? 'verification_failed'

        const action = resolveToolLoopFallback({
          failureKind,
          fallbackPlan: todoItem.fallback_plan,
          attempt,
          maxAttempts,
          failureSummary: result.failureSummary,
          classifiedError: result.classifiedError,
        })

        if (action.type === 'abort') {
          throw new Error(result.failureSummary || 'Tool loop aborted')
        }

        if (action.type === 'pause') {
          return { paused: true }
        }

        if (action.type === 'manual_intervention') {
          todoItem.status = 'pending'
          if (planModePreset) {
            persistPlanModeTodosFromPipeline(flowCtx, batch.todos)
          }
          toolLoopProgressCtx.emitBatchToolLoopStepProgress(
            `\n⛔ Task ${todoItem.id} requires manual intervention: ${action.reason}\nSend a follow-up message to continue.\n\n`,
          )
          flowCtx.hitlAwaitingManualIntervention = true
          stepCtx.setHitlPausedAtStage(FOREACH_ITEM_STEP_ID)
          savePendingApprovalState(stepCtx, index, todoItem.id, {
            awaitingManualIntervention: true,
          })
          return { paused: true }
        }

        if (action.type === 'retry_attempt') {
          lastRetryContext = `${RETRY_CONTEXT.FAILURE_REASON} ${action.reason}\n\n${RETRY_CONTEXT.PREVIOUS_OUTPUT}\n${result.output}`
          if (attempt < maxAttempts) {
            toolLoopProgressCtx.emitBatchToolLoopStepProgress(
              `\n⚠️ Task ${todoItem.id} attempt ${attempt} failed: ${result.failureSummary}\n🔄 Retrying (${attempt + 1}/${maxAttempts})...\n\n`,
            )
          }
          continue
        }

        // skip_todo — stop retrying this item
        break
      }

      if (
        flowCtx.hitlAwaitingApproval ||
        flowCtx.hitlAwaitingFormData ||
        flowCtx.hitlAwaitingManualIntervention
      ) {
        return { paused: true }
      }

      if (!solved) {
        batch.executionSummaries.push(
          TODO_STATUS_LINES.FAILED_AFTER_ATTEMPTS.replace(
            '{id}',
            String(todoItem.id),
          )
            .replace('{attempts}', String(maxAttempts))
            .replace('{plural}', maxAttempts === 1 ? '' : 's')
            .replace('{summary}', lastFailureSummary),
        )
        if (planModePreset) {
          persistPlanModeTodosFromPipeline(flowCtx, batch.todos)
        }
        toolLoopProgressCtx.emitBatchToolLoopStepProgress(
          `\n❌ Task ${todoItem.id} failed: ${lastFailureSummary}\n\n`,
        )
      }

      return {}
    },

    async onBatchEnd(ctx) {
      if (!batch) return

      const { plan, executionSummaries } = batch

      if (planModePreset) {
        persistPlanModeTodosFromPipeline(ctx, batch.todos)
        reconcilePlanExecutionStateFromDisk(ctx)
      }

      if (
        !ctx.hitlAwaitingApproval &&
        !ctx.hitlAwaitingFormData &&
        !ctx.hitlAwaitingManualIntervention
      ) {
        syncToolLoopDigestAfterBatch(
          ctx,
          batch.toolLoopProgressCtx,
          plan,
          executionSummaries,
        )
      }
      ctx.approvalResumeTodoIndex = undefined
      ctx.todoRecoveryAttempt = false
      batch = undefined
    },
  }
}

async function executeSingleTodoWithOrchestration(
  flowCtx: AgentStepContext,
  stepCtx: AgentStepContext,
  todoItem: TodoItem,
  plan: PlanningResult,
  todoIndexInPlan: number,
  attempt: number,
  maxAttempts: number,
  lastRetryContext: string,
  toolLoopProgressCtx: AgentStepContext,
): Promise<ToolLoopAttemptResult> {
  const plannedTodo = resolvePlannedTodoItem(
    plan,
    todoItem,
    todoIndexInPlan,
  ) as TodoItem
  const reference_doc = plannedTodo.reference_doc ?? []

  plannedTodo.status = 'in-progress'
  todoItem.status = 'in-progress'

  stepCtx.beginStep(
    FOREACH_ITEM_STEP_ID,
    stepCtx.title,
    { todoId: plannedTodo.id, attempt, planIndex: todoIndexInPlan },
    buildTodoStepGoalFromPlan(plan, plannedTodo, todoIndexInPlan),
  )
  stepCtx.emitStepProgress(
    `📋 Task ${plannedTodo.id} ${flowCtx.config.todoStatusIcon(plannedTodo.status)} ${plannedTodo.name}${plannedTodo.description ? `: ${plannedTodo.description}` : ''}\n\n`,
  )

  stepCtx.setHitlPausedAtStage(FOREACH_ITEM_STEP_ID)
  const pausedForForm = await runTodoItemPrelude(
    stepCtx,
    plannedTodo,
    todoIndexInPlan,
  )
  if (pausedForForm) {
    return { solved: false, output: '', failureSummary: '' }
  }

  const collectedForm = stepCtx.collectedFormByTodoId[plannedTodo.id]
  const collectedFormJson =
    collectedForm && Object.keys(collectedForm).length > 0
      ? JSON.stringify(collectedForm, null, 2)
      : undefined
  const formValuesCollected = Boolean(collectedFormJson)

  const route = resolveTodoHitlRoute(
    stepCtx,
    plannedTodo,
    todoIndexInPlan,
  )

  const useRecoveryLlm = attempt > 1 || flowCtx.todoRecoveryAttempt

  const result = await executeTodoToolLoop(stepCtx, {
    todoItem,
    todoIndexInPlan,
    plan,
    attempt,
    maxAttempts,
    lastRetryContext,
    route,
    collectedFormJson,
    stepProgressCtx: toolLoopProgressCtx,
    useRecoveryLlm,
  })

  if (flowCtx.todoRecoveryAttempt) {
    flowCtx.todoRecoveryAttempt = false
  }

  publishToolLoopAttachmentsForParent(
    flowCtx.flowContext,
    toolLoopProgressCtx.stepInstanceKey,
  )

  if (result.awaitingToolApproval) {
    flowCtx.hitlAwaitingApproval = true
    stepCtx.setHitlPausedAtStage(FOREACH_ITEM_STEP_ID)
    savePendingApprovalState(stepCtx, todoIndexInPlan, todoItem.id)
    return { solved: false, output: result.output, failureSummary: '' }
  }

  const attachments = flowCtx.getToolLoopAttachmentsForTodo(todoItem.id)

  if (result.failureKind === 'execution_error' || result.failureKind === 'guardrail_halt') {
    todoItem.status = 'failed'
    const summary =
      result.classifiedError?.message ??
      (result.failureKind === 'guardrail_halt'
        ? 'Tool loop halted by guardrails.'
        : STEP_ERRORS.EXECUTION_ERROR.replace('{detail}', 'unknown'))
    return {
      solved: false,
      output: result.output,
      failureSummary: summary,
      failureKind: result.failureKind,
      classifiedError: result.classifiedError,
    }
  }

  if (
    result.failureKind === 'no_output' ||
    (!result.output.trim() && attachments.length === 0)
  ) {
    todoItem.status = 'failed'
    return {
      solved: false,
      output: '',
      failureSummary: STEP_ERRORS.NO_OUTPUT,
      failureKind: 'no_output',
    }
  }

  let deterministicCheck: string | undefined
  const verifyCommand = todoItem.verify_command?.trim()
  if (verifyCommand) {
    const cmd = await runTodoVerifyCommand(stepCtx, verifyCommand)
    if (!cmd.ok) {
      todoItem.status = 'failed'
      stepCtx.emitStepProgress(
        `\n❌ Task ${todoItem.id} command check failed: ${cmd.error}\n\n`,
      )
      return {
        solved: false,
        output: cmd.output || result.output,
        failureSummary: cmd.error,
        failureKind: 'verify_command_failed',
      }
    }
    deterministicCheck = cmd.output
    stepCtx.emitStepProgress(
      `\n✔ Task ${todoItem.id} verify_command passed.\n\n`,
    )
  }

  const verificationInput = await buildExecutionOutputForVerification({
    flow: flowCtx.agentFlow,
    todoId: todoItem.id,
    assistantText: result.output,
    deterministicCheck,
  })

  const verification = await verifyTodoResult(stepCtx, {
    todoName: todoItem.name,
    todoDescription: todoItem.description,
    successCriteria: todoItem.success_criteria,
    output: verificationInput,
    route: formValuesCollected ? 'form-submit' : route,
  })

  const storedOutput = result.output.trim() || verificationInput

  if (verification.valid) {
    todoItem.output = storedOutput
    todoItem.status = 'completed'
    if (result.output.trim()) {
      stepCtx.appendAssistantTurn(result.output)
    }
    stepCtx.emitStepProgress(
      `\n✅ Task ${todoItem.id} validated: ${verification.summary}\n\n`,
    )
    return { solved: true, output: storedOutput, failureSummary: '' }
  }

  todoItem.status = 'failed'
  stepCtx.emitStepProgress(
    `\n❌ Task ${todoItem.id} validation failed: ${verification.summary}\n\n`,
  )
  return {
    solved: false,
    output: storedOutput,
    failureSummary: verification.summary,
    failureKind: 'verification_failed',
  }
}

function resolveTodoHitlRoute(
  ctx: AgentStepContext,
  todoItem: TodoItem,
  todoIndexInPlan: number,
): 'normal' | 'tool-approval' | 'form-submit' {
  const approvalResumeForThisTodo =
    typeof ctx.approvalResumeTodoIndex === 'number' &&
    ctx.approvalResumeTodoIndex === todoIndexInPlan
  if (
    approvalResumeForThisTodo &&
    clientUiIndicatesToolApprovalResume(ctx.opts.clientUiMessages)
  ) {
    return 'tool-approval'
  }
  if (ctx.form.formValuesProvidedByClientRequest(todoItem.id)) {
    return 'form-submit'
  }
  return 'normal'
}

function seedExecutionSummariesFromPlan(
  todos: TodoItem[],
  untilExclusiveIndex: number,
): string[] {
  const lines: string[] = []
  for (let i = 0; i < untilExclusiveIndex; i++) {
    const t = todos[i]
    if (!t) continue
    if (t.status === 'completed' && t.output?.trim()) {
      lines.push(
        TODO_STATUS_LINES.COMPLETED.replace('{id}', String(t.id)).replace(
          '{output}',
          t.output.trim(),
        ),
      )
    } else if (t.status === 'failed') {
      lines.push(
        TODO_STATUS_LINES.FAILED_PAUSED.replace('{id}', String(t.id)),
      )
    }
  }
  return lines
}

function syncToolLoopDigestAfterBatch(
  ctx: AgentStepContext,
  toolLoopProgressCtx: AgentStepContext,
  plan: PlanningResult,
  executionSummaries: string[],
): void {
  ctx.rebuildStepOutputsFromHistory()
  const digest = ctx.buildToolLoopOutputDigest()
  const fallback = executionSummaries.join('\n').trim()
  const rendered = digest.trim() || fallback
  if (!rendered) return
  if (typeof toolLoopProgressCtx.updateStepOutput === 'function') {
    toolLoopProgressCtx.updateStepOutput(
      TOOL_LOOP_STEP_ID,
      TOOL_LOOP_STEP_TITLE,
      rendered,
      rendered,
      { batchDigest: true, todoCount: plan.todoList?.length ?? 0 },
    )
  } else if (typeof ctx.updateStepOutput === 'function') {
    ctx.updateStepOutput(
      TOOL_LOOP_STEP_ID,
      TOOL_LOOP_STEP_TITLE,
      rendered,
      rendered,
      { batchDigest: true, todoCount: plan.todoList?.length ?? 0 },
    )
  }
  const parentKey = toolLoopProgressCtx.stepInstanceKey
  if (
    parentKey &&
    typeof ctx.agentFlow?.mergeToolLoopAttachmentsIntoParent === 'function'
  ) {
    ctx.agentFlow.mergeToolLoopAttachmentsIntoParent(parentKey)
  }
  ctx.rebuildStepOutputsFromHistory()
}
