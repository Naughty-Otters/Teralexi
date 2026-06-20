import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import { publishTextDelta } from './publishers'

export class TextDeltaHandler extends LlmEventHandler<'text-delta'> {
  readonly eventType = 'text-delta' as const

  handle(event: LlmEventForType<'text-delta'>, ctx) {
    ctx.state.text += event.text
    publishTextDelta(ctx, event.text)
  }
}
