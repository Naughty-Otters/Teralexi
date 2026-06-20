import { clearPendingApprovalKeys } from '../approval-keys'
import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import {
  publishToolUpdated,
  publishUIMessageChunk,
  updateToolPart,
} from './publishers'

export class ToolOutputDeniedHandler extends LlmEventHandler<'tool-output-denied'> {
  readonly eventType = 'tool-output-denied' as const

  handle(event: LlmEventForType<'tool-output-denied'>, ctx) {
    clearPendingApprovalKeys(ctx.state.pendingApprovals, event.payload)
    const name =
      typeof event.payload.toolName === 'string'
        ? event.payload.toolName
        : ctx.state.toolParts.get(event.toolCallId)?.name ?? 'unknown'
    updateToolPart(ctx.state, event.toolCallId, name, 'denied')
    publishToolUpdated(ctx, event.toolCallId, 'error', name)
    publishUIMessageChunk(ctx, event.payload)
  }
}
