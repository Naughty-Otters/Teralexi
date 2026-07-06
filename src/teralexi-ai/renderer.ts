/**
 * Renderer-safe teralexi AI exports.
 *
 * Use this entry from the Vue renderer only. Main process should import from `@teralexi-ai`
 * (full barrel). Avoids bundling main-only packages (providers, `@ai-sdk-tools/agents`, …).
 */
export * from './types'
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
