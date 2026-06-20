import { STEP_HELPERS_LABELS } from '../../constants/pipeline'
import { clearPendingApprovalForToolCallId } from '../approval-keys'
import { serializeForAgentCollect } from '../ui-message-projector'
import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import {
  publishTextDelta,
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

    const toolInput = ctx.state.toolParts.get(event.id)?.input
    const body = serializeForAgentCollect(event.result, {
      toolName: event.name,
      toolInput,
    })
    const block = body ? `\n\n${body}\n` : `\n\n(empty)\n`
    ctx.state.text += block
    publishTextDelta(ctx, block)

    publishUIMessageChunk(ctx, {
      type: 'tool-output-available',
      toolCallId: event.id,
      toolName: event.name,
      output: event.result,
    })
  }
}
