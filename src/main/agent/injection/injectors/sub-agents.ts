import { isPlanModeActive } from '../../coding/plan-mode-state'
import {
  buildSubAgentCatalog,
  formatSubAgentInstructionsBlock,
  hasSubAgentDelegationTool,
} from '../../delegation/sub-agent-catalog'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export const subAgentsInjector: AgentInjector = {
  id: 'sub-agents',
  order: INJECTOR_ORDER.SUB_AGENTS,
  applies({ profile, ctx, tools }) {
    if (profile.stage !== 'toolLoop') return false
    if (profile.runDepth !== 0) return false
    if (isPlanModeActive(ctx.opts.conversationId)) return false
    return hasSubAgentDelegationTool(tools.map((t) => t.name))
  },
  injectInstructions({ ctx, tools }) {
    const toolNames = tools.map((t) => t.name)
    const catalog = buildSubAgentCatalog(ctx, toolNames)
    if (!catalog) return null
    return formatSubAgentInstructionsBlock(catalog, toolNames)
  },
}
