import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import { closeOpenTextPart } from './publishers'

export class StepStartHandler extends LlmEventHandler<'step-start'> {
  readonly eventType = 'step-start' as const

  handle(_event: LlmEventForType<'step-start'>, ctx) {
    closeOpenTextPart(ctx)
  }
}
