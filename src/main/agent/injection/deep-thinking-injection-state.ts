export type DeepThinkingInjectionRecord = {
  userMessageId?: string
  userMessageAt?: string
  beforeInjectedAt?: string
  multipleBranchInjectedAt?: string
  afterInjectedAt?: string
}

const deepThinkingByConversation = new Map<string, DeepThinkingInjectionRecord>()

export function recordDeepThinkingBeforeInjection(
  conversationId: string,
  record: DeepThinkingInjectionRecord,
): void {
  const id = conversationId.trim()
  if (!id) return
  const prev = deepThinkingByConversation.get(id)
  deepThinkingByConversation.set(id, { ...prev, ...record, beforeInjectedAt: record.beforeInjectedAt })
}

export function recordMultipleBranchThinkingInjection(
  conversationId: string,
  record: DeepThinkingInjectionRecord,
): void {
  const id = conversationId.trim()
  if (!id) return
  const prev = deepThinkingByConversation.get(id)
  deepThinkingByConversation.set(id, {
    ...prev,
    ...record,
    multipleBranchInjectedAt: record.multipleBranchInjectedAt,
  })
}

export function recordDeepThinkingAfterInjection(
  conversationId: string,
  record: DeepThinkingInjectionRecord,
): void {
  const id = conversationId.trim()
  if (!id) return
  const prev = deepThinkingByConversation.get(id)
  deepThinkingByConversation.set(id, { ...prev, ...record, afterInjectedAt: record.afterInjectedAt })
}

export function getLastDeepThinkingInjection(
  conversationId: string | undefined,
): DeepThinkingInjectionRecord | undefined {
  const id = conversationId?.trim()
  if (!id) return undefined
  return deepThinkingByConversation.get(id)
}

export function clearDeepThinkingInjectionState(conversationId?: string): void {
  if (!conversationId?.trim()) {
    deepThinkingByConversation.clear()
    return
  }
  deepThinkingByConversation.delete(conversationId.trim())
}
