/**
 * AI SDK core runtime — re-exported for app code. Import from `@openfde-ai`, not `ai`.
 */
export {
  convertToModelMessages,
  createUIMessageStream,
  hasToolCall,
  jsonSchema,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  Output,
  stepCountIs,
  isToolOrDynamicToolUIPart,
} from 'ai'
