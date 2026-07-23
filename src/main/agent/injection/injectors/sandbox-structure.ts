import { formatExistingSandboxArtifactsBlock } from '../../sandbox/step-output-links'
import { resolveEffectiveThreadTag } from '../../expr/thread-context-builder'
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

export const sandboxStructureInjector: AgentInjector = {
  id: 'sandbox-structure',
  order: INJECTOR_ORDER.SANDBOX_STRUCTURE,
  applies({ ctx }) {
    return shouldInjectOncePerTurn('sandbox-structure', turnArgs(ctx))
  },
  injectInstructions({ ctx }) {
    const block = ctx.sandbox.buildSandboxStructureBlock(ctx.stepInstanceKey)
    const root = ctx.sandbox.getRoot()
    const conversationId = ctx.opts.conversationId
    const threadTag = resolveEffectiveThreadTag(
      conversationId,
      ctx.getLatestUserMessageContent(),
    )
    const artifacts = root?.trim()
      ? formatExistingSandboxArtifactsBlock(root, { conversationId, threadTag })
      : ''
    const combined = [block, artifacts].filter((part) => part?.trim()).join('\n\n')
    if (!combined.trim()) return null
    recordOncePerTurnInjection('sandbox-structure', turnArgs(ctx))
    return combined.trim()
  },
}
