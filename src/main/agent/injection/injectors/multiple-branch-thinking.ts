import {
  MULTIPLE_BRANCH_THINKING_TEXT,
  shouldInjectMultipleBranchThinking,
} from '../deep-thinking-blocks'
import { recordMultipleBranchThinkingInjection } from '../deep-thinking-injection-state'
import { buildInjectorUserMessage } from '../injector'
import type { UserMessageInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

function isRootRun(ctx: { agentRun?: { meta?: { depth?: number } } }): boolean {
  const depth = ctx.agentRun?.meta?.depth
  return depth === undefined || depth === 0
}

export const multipleBranchThinkingInjector: UserMessageInjector = {
  id: 'multiple-branch-thinking',
  kind: 'user-message',
  order: INJECTOR_ORDER.MULTIPLE_BRANCH_THINKING,
  applies({ profile, ctx, messages, latestUserMessageId, latestUserMessageAt }) {
    if (profile.stage !== 'toolLoop' || !isRootRun(ctx)) return false
    return shouldInjectMultipleBranchThinking(messages, {
      conversationId: ctx.opts.conversationId,
      latestUserMessageId,
      latestUserMessageAt,
    })
  },
  injectUserMessage({ ctx, latestUserMessageId, latestUserMessageAt }) {
    const injectedAt = new Date().toISOString()
    const conversationId = ctx.opts.conversationId?.trim()
    if (conversationId) {
      recordMultipleBranchThinkingInjection(conversationId, {
        userMessageId: latestUserMessageId,
        userMessageAt: latestUserMessageAt ?? injectedAt,
        multipleBranchInjectedAt: injectedAt,
      })
    }

    return buildInjectorUserMessage(
      'multiple-branch-thinking',
      MULTIPLE_BRANCH_THINKING_TEXT,
      injectedAt,
    )
  },
}
