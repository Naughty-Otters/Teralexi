import { createLogger, instrumentInstanceMethods } from '@main/logger'
import { ConversationStore } from './store'

export * from './types'
export { ConversationStore } from './store'

const log = createLogger('services.conversation-store')

// Singleton instance shared across the main process lifetime
let _store: ConversationStore | null = null

export function getConversationStore(): ConversationStore {
  if (!_store) {
    _store = instrumentInstanceMethods(new ConversationStore(), log)
  }
  return _store
}
