import {
  codingModeSystemAddendum,
  getCodingModeForConversation,
} from '../../coding/coding-agent-policy'
import { skillIsCodingAgent } from '@shared/agent/coding-agent'
import { isSubAgentAgentRun } from '../../run/sub-agent-run-policy'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export const codingModeInstructionsInjector: AgentInjector = {
  id: 'coding-mode-instructions',
  order: INJECTOR_ORDER.CODING_MODE,
  applies({ profile }) {
    return profile.stage === 'toolLoop'
  },
  injectInstructions({ ctx }) {
    // Sub-agents share the parent conversationId but must not inherit parent
    // coding-mode hints (explore/yolo/normal auto-explore). They always execute
    // delegated work via tool loop — see sub-agent-run-policy.
    if (isSubAgentAgentRun(ctx)) return null

    const mode = getCodingModeForConversation(ctx.opts.conversationId)
    // Explore/auto addendum is coding-skill only; documents and other skills skip it.
    if (
      (mode === 'explore' || mode === 'auto') &&
      !skillIsCodingAgent(ctx.opts.skillId)
    ) {
      return null
    }
    const addendum = codingModeSystemAddendum(mode).trim()
    return addendum || null
  },
}
