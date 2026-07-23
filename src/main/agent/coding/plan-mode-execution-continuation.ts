import { createLogger } from '@main/logger'
import {
  MAX_TODO_MAX_RETRIES,
  resolveTodoMaxRetries,
} from '@shared/agent/tool-loop'
import { summarizeTodos } from '@shared/agent/todos'
import type { AgentFlowContext } from '../context'
import { markExecuteContinuationReminder } from './plan-mode-session-reminders'
import { readPlanModeTodoList } from './plan-mode-storage-impl'
import { runApprovedPlanTodoForeach } from './plan-mode-todo-foreach'
import {
  reconcilePlanExecutionStateFromDisk,
  resolvePlanStorageOptionsForContext,
  shouldRunPlanTodoForeach,
} from './plan-mode-todo-sync'

const log = createLogger('agent.plan-mode.execution-continuation')

function isPlanExecutionHitlPaused(ctx: AgentFlowContext): boolean {
  return (
    ctx.hitlAwaitingApproval ||
    ctx.hitlAwaitingFormData ||
    ctx.hitlAwaitingManualIntervention
  )
}

function countUnfinishedPlanTodos(ctx: AgentFlowContext): number {
  const conversationId = ctx.opts.conversationId?.trim()
  if (!conversationId) return 0
  const list = readPlanModeTodoList(
    conversationId,
    resolvePlanStorageOptionsForContext(ctx),
  )
  const summary = summarizeTodos(list)
  return summary.pending + summary.inProgress
}

/** Safety cap for same-turn plan foreach continuations after the main pipeline ends. */
export function resolvePlanExecutionMaxContinuationRounds(
  ctx: AgentFlowContext,
): number {
  const unfinished = countUnfinishedPlanTodos(ctx)
  const todoCap = Math.max(unfinished, 1)
  const retryCap = resolveTodoMaxRetries(ctx.opts.todoMaxRetries)
  return Math.min(Math.max(todoCap, retryCap), MAX_TODO_MAX_RETRIES)
}

export function exitPlanModeOutputSucceeded(output: unknown): boolean {
  return (
    typeof output === 'object' &&
    output !== null &&
    !Array.isArray(output) &&
    (output as { ok?: unknown }).ok === true
  )
}

/**
 * Re-enter approved-plan foreach while `plans/todos.json` still has unfinished
 * tasks. Called after the main pipeline completes in the same agent turn.
 */
export async function runPlanExecutionContinuations(
  ctx: AgentFlowContext,
): Promise<number> {
  const conversationId = ctx.opts.conversationId?.trim()
  if (!conversationId) return 0

  let rounds = 0
  const maxRounds = resolvePlanExecutionMaxContinuationRounds(ctx)

  while (
    rounds < maxRounds &&
    !isPlanExecutionHitlPaused(ctx) &&
    shouldRunPlanTodoForeach(ctx)
  ) {
    if (rounds > 0) {
      markExecuteContinuationReminder(conversationId)
    }

    const remaining = countUnfinishedPlanTodos(ctx)
    ctx.emitStepProgress(
      `\nContinuing approved plan — ${remaining} task(s) remaining in plans/todos.json\n\n`,
    )

    const ran = await runApprovedPlanTodoForeach(ctx)
    if (!ran) break

    rounds += 1
    reconcilePlanExecutionStateFromDisk(ctx)

    if (isPlanExecutionHitlPaused(ctx)) break
  }

  if (
    rounds >= maxRounds &&
    shouldRunPlanTodoForeach(ctx) &&
    !isPlanExecutionHitlPaused(ctx)
  ) {
    log.warn('Plan execution continuation limit reached with todos still pending', {
      conversationId,
      maxRounds,
      remaining: countUnfinishedPlanTodos(ctx),
    })
    ctx.emitStepProgress(
      `\n⚠️ Plan execution paused: continuation limit (${maxRounds}) reached with tasks still pending in plans/todos.json.\n\n`,
    )
  }

  return rounds
}
