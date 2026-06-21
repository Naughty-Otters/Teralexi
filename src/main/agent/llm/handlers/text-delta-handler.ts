import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import { publishTextDelta, publishTextDeltaUiChunk } from './publishers'

export class TextDeltaHandler extends LlmEventHandler<'text-delta'> {
  readonly eventType = 'text-delta' as const

  handle(event: LlmEventForType<'text-delta'>, ctx) {
    ctx.state.text += event.text
    publishTextDeltaUiChunk(ctx, event.id, event.text)
    publishTextDelta(ctx, event.text)
  }
}
