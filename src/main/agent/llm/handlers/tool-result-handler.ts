import { clearPendingApprovalForToolCallId } from '../approval-keys'
import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import {
  publishToolUpdated,
  publishUIMessageChunk,
  updateToolPart,
} from './publishers'

export class ToolResultHandler extends LlmEventHandler<'tool-result'> {
  readonly eventType = 'tool-result' as const

  handle(event: LlmEventForType<'tool-result'>, ctx) {
    clearPendingApprovalForToolCallId(ctx.state.pendingApprovals, event.id)
    updateToolPart(ctx.state, event.id, event.name, 'completed')
    publishToolUpdated(ctx, event.id, 'completed', event.name)

    publishUIMessageChunk(ctx, {
      type: 'tool-output-available',
      toolCallId: event.id,
      toolName: event.name,
      output: event.result,
    })
  }
}
