import { STEP_HELPERS_LABELS } from '../../constants/pipeline'
import { clearPendingApprovalForToolCallId } from '../approval-keys'
import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import {
  publishStandaloneTextBubble,
  publishToolUpdated,
  publishUIMessageChunk,
  updateToolPart,
} from './publishers'

export class ToolErrorHandler extends LlmEventHandler<'tool-error'> {
  readonly eventType = 'tool-error' as const

  handle(event: LlmEventForType<'tool-error'>, ctx) {
    clearPendingApprovalForToolCallId(ctx.state.pendingApprovals, event.id)
    updateToolPart(ctx.state, event.id, event.name, 'error')
    publishToolUpdated(ctx, event.id, 'error', event.name)

    const block = STEP_HELPERS_LABELS.TOOL_ERROR_BLOCK.replace(
      '{id}',
      event.id,
    ).replace('{error}', event.message)
    ctx.state.text += block
    publishStandaloneTextBubble(ctx, `tool-error-${event.id}`, block)

    publishUIMessageChunk(ctx, {
      type: 'tool-output-error',
      toolCallId: event.id,
      toolName: event.name,
      errorText: event.message,
    })
  }
}
