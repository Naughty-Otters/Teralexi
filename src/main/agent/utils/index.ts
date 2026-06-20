/**
 * Agent utilities — shared parsing and serialization helpers.
 */

export type { ClientUiMessage } from './client-ui-parse'

export {
  cloneClientUiMessages,
  parseClientUiMessages,
} from './client-ui-parse'

export {
  isAssistantStructuredContent,
  parseAssistantStructuredContent,
  serializeAssistantMessageForHistory,
} from './structured-content'

export type {
  BuildAgentModelMessagesInput,
  TrailingUserForPersistence,
} from './client-ui-messages'

export { buildHistoryModelMessages, mapAgentMessagesToModelMessages } from './conversation-history-messages'

export {
  buildAgentModelMessages,
  sanitizeModelMessagesForAgent,
  clientUiIndicatesToolApprovalResume,
  clientUiMessagesToModelMessages,
  extractTrailingUserForPersistence,
  extractLastUserForPersistence,
  flattenMultipartTextLikeModelMessages,
  sliceClientUiMessagesForToolApprovalContinuation,
} from './client-ui-messages'

export type { LoosePlanningOutput } from './agent-parsing'

export {
  enrichTodoItemsWithInferredScripts,
  formatPlanningExpectations,
  inferReferenceScriptsFromText,
  normalizePlanningOutput,
} from './agent-parsing'

export type {
  LooseThinkingOutput,
  NormalizedThinkingOutput,
  ThinkingExecutionMode,
} from './thinking-parse'

export {
  formatThinkingDigestForPlanning,
  formatThinkingMarkdown,
  normalizeThinkingOutput,
  parseThinkingJson,
} from './thinking-parse'

export type { LooseSummaryOutput } from './summary-parse'

export {
  formatSummaryForContext,
  formatSummaryMarkdown,
  normalizeSummaryOutput,
  parseSummaryJson,
  summaryDisplayText,
  summaryFromStepData,
} from './summary-parse'

export {
  loadAgentRunCredentials,
  loadConversationHistory,
  loadMcpToolsForAgent,
  resolveEnabledSkillToolNames,
} from './agent-run-context'
