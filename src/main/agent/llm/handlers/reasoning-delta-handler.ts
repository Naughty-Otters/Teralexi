import {
  DEFAULT_CHAT_UI_REASONING_MAX_CHARS,
  clampChatUiReasoningMaxChars,
} from '@shared/agent/chat-ui-settings'
import {
  appendReasoningDeltaWithCap,
  createReasoningCapState,
} from '@shared/text/limit-reasoning-text'
import type { LlmEventForType, LlmProcessorContext } from './types'
import { LlmEventHandler } from './types'
import { publishReasoningUiChunk } from './publishers'

function resolveReasoningMaxChars(ctx: LlmProcessorContext): number {
  return clampChatUiReasoningMaxChars(
    ctx.reasoningMaxChars ?? DEFAULT_CHAT_UI_REASONING_MAX_CHARS,
  )
}

export class ReasoningDeltaHandler extends LlmEventHandler<'reasoning-delta'> {
  readonly eventType = 'reasoning-delta' as const

  handle(event: LlmEventForType<'reasoning-delta'>, ctx) {
    ctx.state.reasoning += event.text
    const maxChars = resolveReasoningMaxChars(ctx.run)
    let capState = ctx.state.reasoningCaps.get(event.id)
    if (!capState) {
      capState = createReasoningCapState()
      ctx.state.reasoningCaps.set(event.id, capState)
    }

    const { emitDelta, resetPart, resetText } = appendReasoningDeltaWithCap(
      capState,
      event.text,
      maxChars,
    )
    if (resetPart && resetText) {
      publishReasoningUiChunk(ctx, { type: 'reasoning-end', id: event.id })
      publishReasoningUiChunk(ctx, { type: 'reasoning-start', id: event.id })
      publishReasoningUiChunk(ctx, {
        type: 'reasoning-delta',
        id: event.id,
        delta: resetText,
      })
      return
    }
    if (!emitDelta) return
    publishReasoningUiChunk(ctx, {
      type: 'reasoning-delta',
      id: event.id,
      delta: emitDelta,
    })
  }
}
