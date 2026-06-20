type ConversationStoreUiSyncFn = (conversationId: string) => Promise<void> | void

let syncFn: ConversationStoreUiSyncFn | null = null

export function registerConversationStoreUiSync(
  fn: ConversationStoreUiSyncFn,
): () => void {
  syncFn = fn
  return () => {
    if (syncFn === fn) syncFn = null
  }
}

export function runConversationStoreUiSync(conversationId: string): void {
  void syncFn?.(conversationId)
}
