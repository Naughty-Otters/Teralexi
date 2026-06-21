import type { AgentEventBus } from '../../bus/agent-event-bus'
import type { LlmEvent, LlmUsage } from '../events'
import type { ReasoningCapState } from '@shared/text/limit-reasoning-text'

export type LlmProcessorMode = 'progress' | 'silent'

/** Per-run callbacks and bus passed into event handlers. */
export type LlmProcessorContext = {
  mode?: LlmProcessorMode
  onChunk?: (text: string) => void
  emitStepProgress?: (chunk: string) => void
  onUIMessageChunk?: (chunk: Record<string, unknown>) => void
  /** Text/reasoning/step UI chunks when native `toUIMessageStream` owns tool parts. */
  synthesizeUiChunk?: (chunk: Record<string, unknown>) => void
  reasoningMaxChars?: number
  bus?: AgentEventBus
}

export type LlmProcessorState = {
  text: string
  reasoning: string
  usage?: LlmUsage
  finishReason?: string
  pendingApprovals: Set<string>
  activeTextPartId?: string
  openTextPart: boolean
  activeReasoningPartId?: string
  reasoningCaps: Map<string, ReasoningCapState>
  toolParts: Map<
    string,
    {
      name: string
      status: 'pending' | 'running' | 'completed' | 'error' | 'denied'
      input?: unknown
    }
  >
}

/** Mutable run state + output sinks available to every handler. */
export type LlmEventHandlerContext = {
  state: LlmProcessorState
  run: LlmProcessorContext
}

export type LlmEventType = LlmEvent['type']

export type LlmEventForType<T extends LlmEventType> = Extract<
  LlmEvent,
  { type: T }
>

/** One handler class per {@link LlmEvent} type. */
export abstract class LlmEventHandler<T extends LlmEventType = LlmEventType> {
  abstract readonly eventType: T

  abstract handle(
    event: LlmEventForType<T>,
    ctx: LlmEventHandlerContext,
  ): void
}

export function createLlmProcessorState(): LlmProcessorState {
  return {
    text: '',
    reasoning: '',
    pendingApprovals: new Set(),
    openTextPart: false,
    reasoningCaps: new Map(),
    toolParts: new Map(),
  }
}
