import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import { openTextPart } from './publishers'

export class TextStartHandler extends LlmEventHandler<'text-start'> {
  readonly eventType = 'text-start' as const

  handle(event: LlmEventForType<'text-start'>, ctx) {
    openTextPart(ctx, event.id)
  }
}
