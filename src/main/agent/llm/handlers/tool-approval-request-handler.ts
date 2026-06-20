import { addPendingApprovalKeys } from '../approval-keys'
import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import { publishUIMessageChunk } from './publishers'

export class ToolApprovalRequestHandler extends LlmEventHandler<'tool-approval-request'> {
  readonly eventType = 'tool-approval-request' as const

  handle(event: LlmEventForType<'tool-approval-request'>, ctx) {
    addPendingApprovalKeys(ctx.state.pendingApprovals, event.payload)
    publishUIMessageChunk(ctx, event.payload)
  }
}
