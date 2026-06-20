import type { AgentMessage } from '../types'
import { findPendingExecution } from './store'
import type { PendingAgentExecution } from './types'

/** Locate a paused manual-intervention snapshot for this conversation (any assistant message id). */
export function findPendingManualInterventionExecution(
  conversationId: string | undefined,
): { storeKey: string; pending: PendingAgentExecution } | undefined {
  const c = conversationId?.trim()
  if (!c) return undefined
  const prefix = `${c}:`
  return findPendingExecution(
    (key, pending) =>
      key.startsWith(prefix) && pending.awaitingManualIntervention === true,
  )
}

export function countUserMessages(messages: readonly AgentMessage[]): number {
  return messages.filter((m) => m.role === 'user').length
}

/** True when the incoming turn includes a new non-empty user message after the snapshot. */
export function hasNewUserFollowUpSincePending(
  pending: PendingAgentExecution,
  incoming: readonly AgentMessage[],
): boolean {
  const pendingUserCount = countUserMessages(pending.currentMessages)
  const incomingUserCount = countUserMessages(incoming)
  if (incomingUserCount <= pendingUserCount) return false
  const lastUser = [...incoming].reverse().find((m) => m.role === 'user')
  return Boolean(lastUser?.content?.trim())
}

export function mergePendingMessagesWithFollowUp(
  pending: PendingAgentExecution,
  incoming: readonly AgentMessage[],
): AgentMessage[] {
  const merged: AgentMessage[] = pending.currentMessages.map((m) => ({ ...m }))
  const pendingUserCount = countUserMessages(pending.currentMessages)
  const incomingUsers = incoming.filter((m) => m.role === 'user')
  if (incomingUsers.length <= pendingUserCount) return merged
  for (const user of incomingUsers.slice(pendingUserCount)) {
    if (user.content?.trim()) merged.push({ ...user })
  }
  return merged
}

/** Reset the paused todo to pending in a restored planning snapshot. */
export function resetManualInterventionTodoInStepOutputs(
  stepOutputs: PendingAgentExecution['stepOutputs'],
  todoIndex: number,
  todoId?: number,
): void {
  const list = stepOutputs.planning?.todoList
  if (!list?.length) return
  const byIndex = list[todoIndex]
  const todo =
    byIndex && (todoId == null || byIndex.id === todoId)
      ? byIndex
      : todoId != null
        ? list.find((t) => t.id === todoId)
        : undefined
  if (todo && todo.status !== 'completed') {
    todo.status = 'pending'
  }
}
