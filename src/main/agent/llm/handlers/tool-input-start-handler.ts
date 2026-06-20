import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import { publishToolUpdated, updateToolPart } from './publishers'

export class ToolInputStartHandler extends LlmEventHandler<'tool-input-start'> {
  readonly eventType = 'tool-input-start' as const

  handle(event: LlmEventForType<'tool-input-start'>, ctx) {
    updateToolPart(ctx.state, event.id, event.name, 'pending')
    publishToolUpdated(ctx, event.id, 'pending', event.name)
  }
}
