import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import { publishTextDelta } from './publishers'

export class ReasoningDeltaHandler extends LlmEventHandler<'reasoning-delta'> {
  readonly eventType = 'reasoning-delta' as const

  handle(event: LlmEventForType<'reasoning-delta'>, ctx) {
    ctx.state.reasoning += event.text
    ctx.state.text += event.text
    publishTextDelta(ctx, event.text)
  }
}
