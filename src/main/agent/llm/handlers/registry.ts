import type { LlmEventType } from './types'
import { LlmEventHandler } from './types'
import { TextStartHandler } from './text-start-handler'
import { TextEndHandler } from './text-end-handler'
import { TextDeltaHandler } from './text-delta-handler'
import { ReasoningStartHandler } from './reasoning-start-handler'
import { ReasoningDeltaHandler } from './reasoning-delta-handler'
import { ReasoningEndHandler } from './reasoning-end-handler'
import { StepStartHandler } from './step-start-handler'
import { ToolInputStartHandler } from './tool-input-start-handler'
import { ToolCallHandler } from './tool-call-handler'
import { ToolResultHandler } from './tool-result-handler'
import { ToolErrorHandler } from './tool-error-handler'
import { ToolApprovalRequestHandler } from './tool-approval-request-handler'
import { ToolOutputDeniedHandler } from './tool-output-denied-handler'
import { StepFinishHandler } from './step-finish-handler'
import { FinishHandler } from './finish-handler'
import { ProviderErrorHandler } from './provider-error-handler'

/** Default handler set — one class instance per actionable {@link LlmEvent} type. */
export function createDefaultLlmEventHandlers(): LlmEventHandler[] {
  return [
    new StepStartHandler(),
    new TextStartHandler(),
    new TextDeltaHandler(),
    new TextEndHandler(),
    new ReasoningStartHandler(),
    new ReasoningDeltaHandler(),
    new ReasoningEndHandler(),
    new ToolInputStartHandler(),
    new ToolCallHandler(),
    new ToolResultHandler(),
    new ToolErrorHandler(),
    new ToolApprovalRequestHandler(),
    new ToolOutputDeniedHandler(),
    new StepFinishHandler(),
    new FinishHandler(),
    new ProviderErrorHandler(),
  ]
}

export function indexLlmEventHandlers(
  handlers: readonly LlmEventHandler[],
): Map<LlmEventType, LlmEventHandler> {
  const map = new Map<LlmEventType, LlmEventHandler>()
  for (const handler of handlers) {
    map.set(handler.eventType, handler)
  }
  return map
}

export function createDefaultLlmEventHandlerRegistry(): Map<
  LlmEventType,
  LlmEventHandler
> {
  return indexLlmEventHandlers(createDefaultLlmEventHandlers())
}
