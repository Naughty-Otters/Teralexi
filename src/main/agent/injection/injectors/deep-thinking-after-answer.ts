import {
  DEEP_THINKING_AFTER_ANSWER_TEXT,
  shouldInjectDeepThinkingAfterAnswer,
} from '../deep-thinking-blocks'
import { recordDeepThinkingAfterInjection } from '../deep-thinking-injection-state'
import { buildInjectorUserMessage } from '../injector'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

function isRootRun(ctx: { agentRun?: { meta?: { depth?: number } } }): boolean {
  const depth = ctx.agentRun?.meta?.depth
  return depth === undefined || depth === 0
}

export const deepThinkingAfterAnswerInjector: AgentInjector = {
  id: 'deep-thinking-after-answer',
  order: INJECTOR_ORDER.DEEP_THINKING_AFTER,
  applies({ profile, ctx }) {
    return profile.stage === 'toolLoop' && isRootRun(ctx)
  },
  onPrepareStep(
    { profile, ctx, messages, latestUserMessageId, latestUserMessageAt },
    step,
  ) {
    if (profile.stage !== 'toolLoop' || !isRootRun(ctx)) return undefined
    if (step.stepNumber < 1) return undefined

    if (
      !shouldInjectDeepThinkingAfterAnswer(messages, {
        conversationId: ctx.opts.conversationId,
        latestUserMessageId,
        latestUserMessageAt,
      })
    ) {
      return undefined
    }

    const injectedAt = new Date().toISOString()
    const conversationId = ctx.opts.conversationId?.trim()
    if (conversationId) {
      recordDeepThinkingAfterInjection(conversationId, {
        userMessageId: latestUserMessageId,
        userMessageAt: latestUserMessageAt ?? injectedAt,
        afterInjectedAt: injectedAt,
      })
    }

    return {
      messages: [
        ...messages,
        buildInjectorUserMessage(
          'deep-thinking-after-answer',
          DEEP_THINKING_AFTER_ANSWER_TEXT,
          injectedAt,
        ),
      ],
    }
  },
}
