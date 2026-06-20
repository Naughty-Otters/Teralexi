import type { ModelMessage } from '@openfde-ai'
import type { AgentStepContext } from '../context'
import { compactConversationIfNeeded } from '../compaction'
import { loadChatContextWindowMessages } from '../utils/chat-context-settings'
import { createLogger } from '@main/logger'
import { pruneOldToolResultsFromMessages } from './context-overflow-guard'
import {
  injectThreadContext,
  resolveWindowOldestTimestamp,
} from './thread-context-builder'
import { injectMessages } from '../injection'
import { sanitizeModelMessagesForAgent } from '../utils/client-ui-messages'

const log = createLogger('agent.expr.prepare-loop-messages')

export type PrepareLoopMessagesOpts = {
  threadTag?: string
  windowOldestTs?: string
  clientUiMessages?: unknown
  logContext?: Record<string, unknown>
  /** Zero-based tool-loop LLM step index (for per-step injections). */
  loopStep?: number
}

/**
 * Pre-flight message pipeline for tool-loop runs: thread injection → compaction → prune.
 */
export async function prepareLoopMessages(
  ctx: AgentStepContext,
  messages: ModelMessage[],
  opts: PrepareLoopMessagesOpts = {},
): Promise<ModelMessage[]> {
  let loopMessages = messages
  const { threadTag, logContext } = opts

  if (ctx.opts.conversationId) {
    const { messages: threadMessages, injectedCount } = injectThreadContext(
      loopMessages,
      {
        conversationId: ctx.opts.conversationId,
        currentTag: threadTag,
        windowOldestTs:
          opts.windowOldestTs ??
          resolveWindowOldestTimestamp(opts.clientUiMessages, loopMessages),
      },
    )
    if (injectedCount > 0) {
      loopMessages = threadMessages
      log.debug('Thread context injected', { threadTag, injectedCount, ...logContext })
    }
  }

  const { messages: compactedMessages, compacted } =
    await compactConversationIfNeeded(ctx, loopMessages, {
      messageBudget: loadChatContextWindowMessages(),
    })
  if (compacted) {
    loopMessages = compactedMessages
    log.info('Conversation history compacted before run', { threadTag, ...logContext })
  }

  const { messages: prunedMessages, pruned: prunedCount } =
    pruneOldToolResultsFromMessages(loopMessages, {
      currentThreadTag: threadTag,
    })
  if (prunedCount > 0) {
    log.debug('Pre-flight tool result pruning applied', {
      prunedCount,
      threadTag,
      ...logContext,
    })
  }

  return sanitizeModelMessagesForAgent(
    await injectMessages(ctx, prunedMessages, opts.loopStep ?? 0),
    { label: 'prepareLoopMessages' },
  )
}
