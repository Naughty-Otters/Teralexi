import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'
import {
  recordOncePerTurnInjection,
  shouldInjectOncePerTurn,
} from '../once-per-turn-injection-state'

function turnArgs(ctx: {
  opts: { conversationId?: string; assistantMessageId?: string }
}): {
  conversationId?: string
  assistantMessageId?: string
} {
  return {
    conversationId: ctx.opts.conversationId,
    assistantMessageId: ctx.opts.assistantMessageId,
  }
}

export const workspaceStructureInjector: AgentInjector = {
  id: 'workspace-structure',
  order: INJECTOR_ORDER.WORKSPACE_STRUCTURE,
  applies({ ctx }) {
    return shouldInjectOncePerTurn('workspace-structure', turnArgs(ctx))
  },
  injectInstructions({ ctx }) {
    const block = ctx.sandbox.buildWorkspaceStructureBlock()
    if (!block?.trim()) return null
    recordOncePerTurnInjection('workspace-structure', turnArgs(ctx))
    return block.trim()
  },
}
