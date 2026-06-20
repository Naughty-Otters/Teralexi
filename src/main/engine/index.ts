/**
 * Agent conversation engine — run and stop agent turns for a conversation.
 *
 * Import from `@main/engine` only (not from implementation files).
 */

export {
  runAgentForConversation,
  runSubAgentMentionDelegation,
  stopAgentForConversation,
  isConversationRunInFlight,
  type RunAgentForConversationArgs,
  type RunAgentForConversationResult,
  type RunSubAgentMentionArgs,
} from './conversation'
