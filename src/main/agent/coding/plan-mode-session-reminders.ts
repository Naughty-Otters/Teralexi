/**
 * Ephemeral one-shot injection reminders — not persisted across process restarts.
 * Replaces legacy `pendingPlanActivation` / `pendingPlanExecution` DB fields.
 */
const enterReminderByConversation = new Set<string>()
const executeReminderByConversation = new Set<string>()
/** Blocks silent auto-explore after an approved plan finishes executing. */
const executionCompletedByConversation = new Set<string>()

export function markEnterPlanReminder(conversationId: string): void {
  const id = conversationId.trim()
  if (!id) return
  enterReminderByConversation.add(id)
}

export function hasEnterPlanReminder(conversationId: string): boolean {
  return enterReminderByConversation.has(conversationId.trim())
}

export function consumeEnterPlanReminder(conversationId: string): boolean {
  const id = conversationId.trim()
  if (!enterReminderByConversation.has(id)) return false
  enterReminderByConversation.delete(id)
  return true
}

export function markExecutePlanReminder(conversationId: string): void {
  const id = conversationId.trim()
  if (!id) return
  executeReminderByConversation.add(id)
}

export function hasExecutePlanReminder(conversationId: string): boolean {
  return executeReminderByConversation.has(conversationId.trim())
}

export function consumeExecutePlanReminder(conversationId: string): boolean {
  const id = conversationId.trim()
  if (!executeReminderByConversation.has(id)) return false
  executeReminderByConversation.delete(id)
  return true
}

export function clearPlanReminders(conversationId: string): void {
  const id = conversationId.trim()
  enterReminderByConversation.delete(id)
  executeReminderByConversation.delete(id)
}

export function markPlanExecutionCompleted(conversationId: string): void {
  const id = conversationId.trim()
  if (!id) return
  executionCompletedByConversation.add(id)
}

export function hasRecentPlanExecutionCompleted(
  conversationId: string | undefined,
): boolean {
  const id = conversationId?.trim()
  if (!id) return false
  return executionCompletedByConversation.has(id)
}

export function clearPlanExecutionCompleted(conversationId: string): void {
  const id = conversationId.trim()
  if (!id) return
  executionCompletedByConversation.delete(id)
}

/** Test-only reset. */
export function resetAllPlanRemindersForTests(): void {
  enterReminderByConversation.clear()
  executeReminderByConversation.clear()
  executionCompletedByConversation.clear()
}
