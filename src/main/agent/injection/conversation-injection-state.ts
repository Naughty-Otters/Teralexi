export type DatetimeInjectionRecord = {
  userMessageId?: string
  userMessageAt?: string
  dayKey: string
  injectedAt: string
}

const datetimeInjectionByConversation = new Map<string, DatetimeInjectionRecord>()

export function recordDatetimeInjection(
  conversationId: string,
  record: DatetimeInjectionRecord,
): void {
  const id = conversationId.trim()
  if (!id) return
  datetimeInjectionByConversation.set(id, record)
}

export function getLastDatetimeInjection(
  conversationId: string | undefined,
): DatetimeInjectionRecord | undefined {
  const id = conversationId?.trim()
  if (!id) return undefined
  return datetimeInjectionByConversation.get(id)
}

export function clearDatetimeInjectionState(conversationId?: string): void {
  if (!conversationId?.trim()) {
    datetimeInjectionByConversation.clear()
    return
  }
  datetimeInjectionByConversation.delete(conversationId.trim())
}
