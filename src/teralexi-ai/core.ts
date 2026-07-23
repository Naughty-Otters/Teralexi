/**
 * AI SDK core runtime — re-exported for app code. Import from `@teralexi-ai`, not `ai`.
 */
export {
  convertToModelMessages,
  createUIMessageStream,
  hasToolCall,
  jsonSchema,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  Output,
  stepCountIs,
  isToolUIPart,
} from 'ai'

/** @deprecated Use `isToolUIPart` (AI SDK 7). */
export { isToolUIPart as isToolOrDynamicToolUIPart } from 'ai'
