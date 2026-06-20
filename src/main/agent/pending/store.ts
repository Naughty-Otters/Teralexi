import { createLogger, traceFunction } from '@main/logger'
import type { PendingAgentExecution } from './types'

const pendingByKey = new Map<string, PendingAgentExecution>()
const log = createLogger('agent.pending.store')

function pendingExecutionStorageKeyImpl(
  conversationId: string | undefined,
  assistantMessageId: string | undefined,
): string | undefined {
  const c = conversationId?.trim()
  const a = assistantMessageId?.trim()
  if (!c || !a) return undefined
  return `${c}:${a}`
}

function setPendingExecutionImpl(
  key: string,
  state: PendingAgentExecution,
): void {
  pendingByKey.set(key, state)
}

function getPendingExecutionImpl(
  key: string,
): PendingAgentExecution | undefined {
  return pendingByKey.get(key)
}

function deletePendingExecutionImpl(key: string): void {
  pendingByKey.delete(key)
}

function findPendingExecutionImpl(
  match: (storeKey: string, pending: PendingAgentExecution) => boolean,
): { storeKey: string; pending: PendingAgentExecution } | undefined {
  for (const [key, pending] of pendingByKey.entries()) {
    if (match(key, pending)) {
      return { storeKey: key, pending }
    }
  }
  return undefined
}

export const pendingExecutionStorageKey = traceFunction(
  log,
  'pendingExecutionStorageKey',
  pendingExecutionStorageKeyImpl,
)

export const setPendingExecution = traceFunction(
  log,
  'setPendingExecution',
  setPendingExecutionImpl,
)

export const getPendingExecution = traceFunction(
  log,
  'getPendingExecution',
  getPendingExecutionImpl,
)

export const deletePendingExecution = traceFunction(
  log,
  'deletePendingExecution',
  deletePendingExecutionImpl,
)

export const findPendingExecution = traceFunction(
  log,
  'findPendingExecution',
  findPendingExecutionImpl,
)
