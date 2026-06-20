import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'

export class StepFinishHandler extends LlmEventHandler<'step-finish'> {
  readonly eventType = 'step-finish' as const

  handle(event: LlmEventForType<'step-finish'>, ctx) {
    if (event.usage) ctx.state.usage = event.usage
  }
}
