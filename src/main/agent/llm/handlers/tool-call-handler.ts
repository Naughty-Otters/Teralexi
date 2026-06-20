import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import {
  publishToolUpdated,
  publishUIMessageChunk,
  updateToolPart,
} from './publishers'

export class ToolCallHandler extends LlmEventHandler<'tool-call'> {
  readonly eventType = 'tool-call' as const

  handle(event: LlmEventForType<'tool-call'>, ctx) {
    updateToolPart(ctx.state, event.id, event.name, 'running', event.input)
    publishToolUpdated(ctx, event.id, 'running', event.name)
    publishUIMessageChunk(ctx, {
      type: 'tool-input-available',
      toolCallId: event.id,
      toolName: event.name,
      input: event.input,
    })
  }
}
