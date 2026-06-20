import type { LlmEvent, LlmUsage } from './events'
import { isTextDeltaEvent, isToolCallEvent } from './events'

export type LlmResponseInput = {
  events: readonly LlmEvent[]
  usage?: LlmUsage
}

export class LlmResponse {
  readonly events: readonly LlmEvent[]
  readonly usage?: LlmUsage

  constructor(input: LlmResponseInput) {
    this.events = input.events
    this.usage = input.usage
  }

  get text(): string {
    return LlmResponse.textFromEvents(this.events)
  }

  get reasoning(): string {
    return this.events
      .filter((e): e is Extract<LlmEvent, { type: 'reasoning-delta' }> =>
        e.type === 'reasoning-delta',
      )
      .map((e) => e.text)
      .join('')
  }

  get toolCalls(): Extract<LlmEvent, { type: 'tool-call' }>[] {
    return this.events.filter(isToolCallEvent)
  }

  static textFromEvents(events: readonly LlmEvent[]): string {
    return events.filter(isTextDeltaEvent).map((e) => e.text).join('')
  }

  static usageFromEvents(events: readonly LlmEvent[]): LlmUsage | undefined {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (
        (e.type === 'finish' || e.type === 'step-finish') &&
        e.usage !== undefined
      ) {
        return e.usage
      }
    }
    return undefined
  }
}
