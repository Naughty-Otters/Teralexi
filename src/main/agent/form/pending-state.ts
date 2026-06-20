import type { AgentStepContext } from '../context'
import { cloneStepContextMap, cloneStepHistory } from '../context'
import {
  findPendingExecution,
  pendingExecutionStorageKey,
  setPendingExecution,
} from '../pending/store'
import type { PendingAgentExecution } from '../pending/types'
import { cloneAgentMessages, cloneStepOutputs } from '../types'

/** When the client uses a new assistant stream id after form submit, locate pending by form request id. */
export function findPendingFormExecutionByRequestId(
  conversationId: string | undefined,
  formRequestId: string,
): { storeKey: string; pending: PendingAgentExecution } | undefined {
  const c = conversationId?.trim()
  const rid = formRequestId.trim()
  if (!c || !rid) return undefined
  const prefix = `${c}:`
  return findPendingExecution(
    (key, pending) =>
      key.startsWith(prefix) && pending.pendingFormRequestId === rid,
  )
}

export function savePendingFormExecution(
  ctx: AgentStepContext,
  options: {
    nextTodoIndex: number
    pendingFormRequestId: string
    pendingFormTodoId: number
  },
): boolean {
  const storageKey = pendingExecutionStorageKey(
    ctx.opts.conversationId,
    ctx.opts.assistantMessageId,
  )
  if (!storageKey) return false

  // Serialize generated form schemas (Map → plain object) for persistence.
  const generatedFormSchemas: Record<number, import('../form/schema').ParsedCollectFormSchema> = {}
  for (const [id, schema] of (ctx.generatedFormSchemaByTodoId ?? new Map()).entries()) {
    generatedFormSchemas[id] = schema
  }

  setPendingExecution(storageKey, {
    currentMessages: cloneAgentMessages(ctx.currentMessages),
    stepOutputs: cloneStepOutputs(ctx.stepOutputs),
    stepContexts: cloneStepContextMap(ctx.stepContexts),
    stepHistory: cloneStepHistory(ctx.stepHistory),
    nextTodoIndex: options.nextTodoIndex,
    pendingFormRequestId: options.pendingFormRequestId,
    pendingFormTodoId: options.pendingFormTodoId,
    collectedFormByTodoId: { ...ctx.collectedFormByTodoId },
    pausedStageId: ctx.lastHitlPausedStageId,
    ...(Object.keys(generatedFormSchemas).length > 0 ? { generatedFormSchemas } : {}),
  })
  return true
}
