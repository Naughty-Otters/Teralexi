import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import { createReasoningCapState } from '@shared/text/limit-reasoning-text'
import { publishReasoningUiChunk } from './publishers'

export class ReasoningStartHandler extends LlmEventHandler<'reasoning-start'> {
  readonly eventType = 'reasoning-start' as const

  handle(event: LlmEventForType<'reasoning-start'>, ctx) {
    ctx.state.activeReasoningPartId = event.id
    ctx.state.reasoningCaps.set(event.id, createReasoningCapState())
    publishReasoningUiChunk(ctx, { type: 'reasoning-start', id: event.id })
  }
}
