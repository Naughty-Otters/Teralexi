import { formatExistingSandboxArtifactsBlock } from '../../sandbox/step-output-links'
import { resolveEffectiveThreadTag } from '../../expr/thread-context-builder'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export const sandboxStructureInjector: AgentInjector = {
  id: 'sandbox-structure',
  order: INJECTOR_ORDER.SANDBOX_STRUCTURE,
  applies() {
    return true
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
    return combined.trim() || null
  },
}
