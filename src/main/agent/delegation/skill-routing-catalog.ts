import { appCache } from '@main/cache/app-cache'
import type { EngineAgent } from '../config/catalog'
import type { AgentStepContext } from '../context'
import { isPlanModeActive } from '../coding/plan-mode-state'
import { resolveDelegatableSubAgentTargets } from '@shared/agent/sub-agent-targets'
import {
  extractTriggerSection,
  formatSkillRoutingInstructionsBlock,
  formatSkillRoutingToolSuffix,
  mergeSkillRoutingEntries,
  resolveSkillGroupSiblingTargets,
  type SkillRoutingAgentRef,
  type SkillRoutingEntry,
} from '@shared/agent/skill-triggers'
import {
  BEST_OF_N_TOOL_NAME,
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_AGENTS_TOOL_NAME,
  SUB_AGENT_TOOL_NAMES,
} from '@toolSet/sub-agents/constants'

const INVOKE_GATED_TOOL_NAMES = new Set([
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_AGENTS_TOOL_NAME,
  BEST_OF_N_TOOL_NAME,
])

export type SkillRoutingCatalog = {
  entries: SkillRoutingEntry[]
  groupLabel: string | null
}

/** @deprecated Use SkillRoutingCatalog — kept for migration references. */
export type SubAgentCatalog = SkillRoutingCatalog & {
  invokeAgentTargets: Array<{ id: string; name: string; description: string }>
}

function isRootRun(ctx: AgentStepContext): boolean {
  const depth = ctx.agentRun?.meta?.depth
  return depth === undefined || depth === 0
}

function toRoutingAgentRef(agent: EngineAgent): SkillRoutingAgentRef {
  return {
    id: agent.id,
    name: agent.name,
    skillId: agent.skillId,
    description: agent.description,
    skillsPrompt: agent.skillsPrompt,
    skillGroup: agent.skillGroup,
    skillGroupLabel: agent.skillGroupLabel,
    skillVariant: agent.skillVariant,
    skillVariantLabel: agent.skillVariantLabel,
    skillVariantOrder: agent.skillVariantOrder,
    enabled: agent.enabled,
    allowAsSubAgent: agent.allowAsSubAgent,
  }
}

export function hasSubAgentDelegationTool(
  availableToolNames: readonly string[],
): boolean {
  return availableToolNames.some((name) => SUB_AGENT_TOOL_NAMES.has(name))
}

function resolveAgentSkillIdFromEngine(agent: EngineAgent): string | null {
  const fromField = agent.skillId?.trim()
  if (fromField) return fromField
  const id = agent.id.trim()
  if (id.startsWith('skill:')) return id.slice('skill:'.length)
  return null
}

function resolveSubAgentRoutingEntries(
  ctx: AgentStepContext,
  caller: SkillRoutingAgentRef,
  allAgents: readonly EngineAgent[],
  hasInvokeGated: boolean,
): SkillRoutingEntry[] {
  if (!hasInvokeGated) return []
  if (!ctx.executionSteps?.toolLoop?.allowSubAgents) return []

  return resolveDelegatableSubAgentTargets(
    {
      id: caller.id,
      allowSubAgents: true,
      subAgentIds: ctx.executionSteps.toolLoop.subAgentIds,
    },
    allAgents.map(toRoutingAgentRef),
  ).map((target) => {
    const agent = allAgents.find((a) => a.id === target.id)
    return {
      agentId: target.id,
      skillId: agent ? resolveAgentSkillIdFromEngine(agent) : null,
      displayName: target.name,
      description: target.description,
      trigger:
        (agent?.skillsPrompt ? extractTriggerSection(agent.skillsPrompt) : null) ??
        target.description,
      canSwitch: Boolean(agent && resolveAgentSkillIdFromEngine(agent)),
      canInvoke: true,
    }
  })
}

export function hasSkillRoutingTargets(
  ctx: AgentStepContext,
  availableToolNames: readonly string[],
): boolean {
  return buildSkillRoutingCatalog(ctx, availableToolNames) != null
}

export function buildSkillRoutingCatalog(
  ctx: AgentStepContext,
  availableToolNames: readonly string[],
): SkillRoutingCatalog | null {
  if (!isRootRun(ctx)) return null
  if (isPlanModeActive(ctx.opts.conversationId)) return null

  const userId = ctx.opts.userId?.trim()
  if (!userId) return null

  const agents = appCache.getAgents(userId)
  if (!agents?.length) return null

  const caller = agents.find((a) => a.id === ctx.opts.agentId)
  if (!caller) return null

  const callerRef = toRoutingAgentRef(caller)
  const names = new Set(availableToolNames)
  const hasInvokeGated = [...INVOKE_GATED_TOOL_NAMES].some((n) => names.has(n))

  const variants = resolveSkillGroupSiblingTargets(
    callerRef,
    agents.map(toRoutingAgentRef),
  )
  const subAgents = resolveSubAgentRoutingEntries(
    ctx,
    callerRef,
    agents,
    hasInvokeGated,
  )
  const entries = mergeSkillRoutingEntries(variants, subAgents)

  if (entries.length === 0) return null

  return {
    entries,
    groupLabel:
      callerRef.skillGroupLabel?.trim() || callerRef.skillGroup?.trim() || null,
  }
}

/** Backward-compatible alias used by tool-loop-expr. */
export function buildSubAgentCatalog(
  ctx: AgentStepContext,
  availableToolNames: readonly string[],
): SubAgentCatalog | null {
  const catalog = buildSkillRoutingCatalog(ctx, availableToolNames)
  if (!catalog) return null
  return {
    ...catalog,
    invokeAgentTargets: catalog.entries
      .filter((e) => e.canInvoke)
      .map((e) => ({
        id: e.agentId,
        name: e.displayName,
        description: e.trigger?.trim() || e.description,
      })),
  }
}

export function formatSkillRoutingBlock(
  catalog: SkillRoutingCatalog,
  availableToolNames: readonly string[],
): string {
  const names = new Set(availableToolNames)
  const hasInvokeAgent = [...INVOKE_GATED_TOOL_NAMES].some((n) => names.has(n))
  return formatSkillRoutingInstructionsBlock(catalog.entries, {
    hasInvokeAgent,
    groupLabel: catalog.groupLabel,
  })
}

/** Backward-compatible alias used by tests and injector. */
export function formatSubAgentInstructionsBlock(
  catalog: SkillRoutingCatalog,
  availableToolNames: readonly string[],
): string {
  return formatSkillRoutingBlock(catalog, availableToolNames)
}

export function formatSubAgentToolSuffix(
  toolName: string,
  catalog: SkillRoutingCatalog,
): string | null {
  if (
    toolName !== INVOKE_AGENT_TOOL_NAME &&
    toolName !== INVOKE_AGENTS_TOOL_NAME &&
    toolName !== BEST_OF_N_TOOL_NAME
  ) {
    return null
  }
  const invokeEntries = catalog.entries.filter((e) => e.canInvoke)
  if (invokeEntries.length === 0) return null
  return formatSkillRoutingToolSuffix(invokeEntries)
}
