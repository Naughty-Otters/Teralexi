import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import { closeOpenTextPart } from './publishers'

export class TextEndHandler extends LlmEventHandler<'text-end'> {
  readonly eventType = 'text-end' as const

  handle(_event: LlmEventForType<'text-end'>, ctx) {
    closeOpenTextPart(ctx)
  }
}
