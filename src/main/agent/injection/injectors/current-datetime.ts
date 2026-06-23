import {
  calendarDayKey,
  formatCurrentDatetimeInstructionBlock,
  shouldInjectCurrentDatetime,
} from '../current-datetime-block'
import { recordDatetimeInjection } from '../conversation-injection-state'
import { buildInjectorUserMessage } from '../injector'
import type { UserMessageInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export const currentDatetimeInjector: UserMessageInjector = {
  id: 'current-datetime',
  kind: 'user-message',
  order: INJECTOR_ORDER.CURRENT_DATETIME,
  applies({ ctx, messages, latestUserMessageId, latestUserMessageAt }) {
    return shouldInjectCurrentDatetime(messages, {
      conversationId: ctx.opts.conversationId,
      latestUserMessageId,
      latestUserMessageAt,
    })
  },
  injectUserMessage({ ctx, latestUserMessageId, latestUserMessageAt }) {
    const injectedAt = new Date().toISOString()
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    const conversationId = ctx.opts.conversationId?.trim()
    if (conversationId) {
      recordDatetimeInjection(conversationId, {
        userMessageId: latestUserMessageId,
        userMessageAt: latestUserMessageAt ?? injectedAt,
        dayKey: calendarDayKey(injectedAt, timeZone),
        injectedAt,
      })
    }

    return buildInjectorUserMessage(
      'current-datetime',
      formatCurrentDatetimeInstructionBlock({ now: new Date(injectedAt) }),
      injectedAt,
    )
  },
}
