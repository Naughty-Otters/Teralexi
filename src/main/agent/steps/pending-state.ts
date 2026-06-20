import type { AgentStepContext } from '../context'
import { ResearchStepContext } from '../steps/research/research-step-context'
import { cloneStepContextMap, cloneStepHistory } from '../context'
import {
  getPendingExecution,
  pendingExecutionStorageKey,
  setPendingExecution,
} from '../pending/store'
import { cloneAgentMessages, cloneStepOutputs } from '../types'

/** After the pipeline marks the HITL pause stage, backfill `pausedStageId` on an earlier snapshot. */
export function patchPendingExecutionPausedStage(
  conversationId: string | undefined,
  assistantMessageId: string | undefined,
  pausedStageId: string | undefined,
): void {
  const storageKey = pendingExecutionStorageKey(conversationId, assistantMessageId)
  const stage = pausedStageId?.trim()
  if (!storageKey || !stage) return
  const pending = getPendingExecution(storageKey)
  if (!pending || pending.pausedStageId === stage) return
  setPendingExecution(storageKey, { ...pending, pausedStageId: stage })
}

export type SavePendingApprovalOptions = {
  awaitingManualIntervention?: boolean
}

export function savePendingApprovalState(
  ctx: AgentStepContext,
  nextTodoIndex = 0,
  pendingApprovalTodoId?: number,
  options?: SavePendingApprovalOptions,
): void {
  const storageKey = pendingExecutionStorageKey(
    ctx.opts.conversationId,
    ctx.opts.assistantMessageId,
  )
  if (!storageKey) return

  setPendingExecution(storageKey, {
    currentMessages: cloneAgentMessages(ctx.currentMessages),
    stepOutputs: cloneStepOutputs(ctx.stepOutputs),
    stepContexts: cloneStepContextMap(ctx.stepContexts),
    stepHistory: cloneStepHistory(ctx.stepHistory),
    nextTodoIndex,
    ...(options?.awaitingManualIntervention &&
    typeof pendingApprovalTodoId === 'number'
      ? {
          awaitingManualIntervention: true,
          pendingManualInterventionTodoId: pendingApprovalTodoId,
        }
      : typeof pendingApprovalTodoId === 'number'
        ? { pendingApprovalTodoId }
        : {}),
    collectedFormByTodoId: { ...ctx.collectedFormByTodoId },
    pausedStageId: ctx.lastHitlPausedStageId,
    ...(ctx instanceof ResearchStepContext && ctx.researchResumeState
      ? { researchResumeState: ctx.researchResumeState }
      : {}),
  })
}
