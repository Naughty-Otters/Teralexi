import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import { createLogger } from '@main/logger'
import { closeOpenTextPart } from './publishers'

const log = createLogger('agent.llm.handlers')

export class FinishHandler extends LlmEventHandler<'finish'> {
  readonly eventType = 'finish' as const

  handle(event: LlmEventForType<'finish'>, ctx) {
    if (event.usage) ctx.state.usage = event.usage
    ctx.state.finishReason = event.reason
    if (event.reason === 'error' || event.reason === 'length') {
      log.warn('LLM stream finished with non-success reason', {
        reason: event.reason,
        textLength: ctx.state.text.length,
      })
    }
    ctx.run.bus?.publish({
      type: 'agent.llm.finish',
      usage: event.usage,
      reason: event.reason,
    })
    closeOpenTextPart(ctx)
  }
}
