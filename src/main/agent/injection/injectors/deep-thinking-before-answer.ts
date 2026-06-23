import {
  DEEP_THINKING_BEFORE_ANSWER_TEXT,
  shouldInjectDeepThinkingBeforeAnswer,
} from '../deep-thinking-blocks'
import { recordDeepThinkingBeforeInjection } from '../deep-thinking-injection-state'
import { buildInjectorUserMessage } from '../injector'
import type { UserMessageInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

function isRootRun(ctx: { agentRun?: { meta?: { depth?: number } } }): boolean {
  const depth = ctx.agentRun?.meta?.depth
  return depth === undefined || depth === 0
}

export const deepThinkingBeforeAnswerInjector: UserMessageInjector = {
  id: 'deep-thinking-before-answer',
  kind: 'user-message',
  order: INJECTOR_ORDER.DEEP_THINKING_BEFORE,
  applies({ profile, ctx, messages, latestUserMessageId, latestUserMessageAt }) {
    if (profile.stage !== 'toolLoop' || !isRootRun(ctx)) return false
    return shouldInjectDeepThinkingBeforeAnswer(messages, {
      conversationId: ctx.opts.conversationId,
      latestUserMessageId,
      latestUserMessageAt,
    })
  },
  injectUserMessage({ ctx, latestUserMessageId, latestUserMessageAt }) {
    const injectedAt = new Date().toISOString()
    const conversationId = ctx.opts.conversationId?.trim()
    if (conversationId) {
      recordDeepThinkingBeforeInjection(conversationId, {
        userMessageId: latestUserMessageId,
        userMessageAt: latestUserMessageAt ?? injectedAt,
        beforeInjectedAt: injectedAt,
      })
    }

    return buildInjectorUserMessage(
      'deep-thinking-before-answer',
      DEEP_THINKING_BEFORE_ANSWER_TEXT,
      injectedAt,
    )
  },
}
