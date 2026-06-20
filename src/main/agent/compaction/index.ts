export {
  compactConversationIfNeeded,
  estimateMessageChars,
  extractFileOps,
  findRecentRoundStart,
  splitMessagesForMessageBudget,
  serializeMessagesForSummary,
  buildCompactionNote,
  DEFAULT_COMPACTION_CHAR_BUDGET,
  DEFAULT_PRESERVE_RECENT_ROUNDS,
  COMPACTION_SYSTEM,
} from './context-compaction'
export { autoCompactStoredConversationIfNeeded } from './auto-stored-conversation-compact'
export type {
  CompactionOptions,
  CompactionResult,
  FileOps,
} from './context-compaction'
