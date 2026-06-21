import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import { publishReasoningUiChunk } from './publishers'

export class ReasoningEndHandler extends LlmEventHandler<'reasoning-end'> {
  readonly eventType = 'reasoning-end' as const

  handle(event: LlmEventForType<'reasoning-end'>, ctx) {
    publishReasoningUiChunk(ctx, { type: 'reasoning-end', id: event.id })
    ctx.state.reasoningCaps.delete(event.id)
    if (ctx.state.activeReasoningPartId === event.id) {
      ctx.state.activeReasoningPartId = undefined
    }
  }
}
