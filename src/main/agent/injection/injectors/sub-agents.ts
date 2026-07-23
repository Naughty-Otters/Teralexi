import { isPlanModeActive } from '../../coding/plan-mode-state'
import {
  buildSkillRoutingCatalog,
  formatSkillRoutingBlock,
  hasSkillRoutingTargets,
  hasSubAgentDelegationTool,
} from '../../delegation/skill-routing-catalog'
import { formatBuiltinSubagentPriorityInstructions } from '@toolSet/sub-agents/subagent-profiles'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export const subAgentsInjector: AgentInjector = {
  id: 'sub-agents',
  order: INJECTOR_ORDER.SUB_AGENTS,
  applies({ profile, ctx, tools }) {
    if (profile.stage !== 'toolLoop') return false
    if (profile.runDepth !== 0) return false
    if (isPlanModeActive(ctx.opts.conversationId)) return false
    if (!ctx.opts.userId?.trim()) return false
    if (hasSubAgentDelegationTool(tools.map((t) => t.name))) return true
    return hasSkillRoutingTargets(ctx, tools.map((t) => t.name))
  },
  injectInstructions({ ctx, tools }) {
    const toolNames = tools.map((t) => t.name)
    const catalog = buildSkillRoutingCatalog(ctx, toolNames)
    if (!catalog) return null
    const routing = formatSkillRoutingBlock(catalog, toolNames)
    if (!hasSubAgentDelegationTool(toolNames)) return routing
    const priority = formatBuiltinSubagentPriorityInstructions()
    return [priority, routing].filter(Boolean).join('\n\n')
  },
}
