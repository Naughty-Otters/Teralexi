import { appCache } from '@main/cache/app-cache'
import type { AgentStepContext } from '../context'
import { isPlanModeActive } from '../coding/plan-mode-state'
import { resolveDelegatableSubAgentTargets } from '@shared/agent/sub-agent-targets'
import {
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_AGENTS_TOOL_NAME,
  SUB_AGENT_TOOL_NAMES,
} from '@toolSet/sub-agents/constants'

export type SubAgentTargetEntry = {
  id: string
  name: string
  description: string
}

export type SubAgentCatalog = {
  invokeAgentTargets: SubAgentTargetEntry[]
}

const INVOKE_GATED_TOOL_NAMES = new Set([
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_AGENTS_TOOL_NAME,
])

function isRootRun(ctx: AgentStepContext): boolean {
  const depth = ctx.agentRun?.meta?.depth
  return depth === undefined || depth === 0
}

export function hasSubAgentDelegationTool(
  availableToolNames: readonly string[],
): boolean {
  return availableToolNames.some((name) => SUB_AGENT_TOOL_NAMES.has(name))
}

export function buildSubAgentCatalog(
  ctx: AgentStepContext,
  availableToolNames: readonly string[],
): SubAgentCatalog | null {
  if (!isRootRun(ctx)) return null
  if (isPlanModeActive(ctx.opts.conversationId)) return null
  if (!hasSubAgentDelegationTool(availableToolNames)) return null

  const userId = ctx.opts.userId?.trim()
  if (!userId) return null

  const agents = appCache.getAgents(userId)
  if (!agents?.length) return null

  const names = new Set(availableToolNames)
  const hasInvokeGated = [...INVOKE_GATED_TOOL_NAMES].some((n) => names.has(n))

  let invokeAgentTargets: SubAgentTargetEntry[] = []
  if (hasInvokeGated && ctx.executionSteps?.toolLoop?.allowSubAgents) {
    invokeAgentTargets = resolveDelegatableSubAgentTargets(
      {
        id: ctx.opts.agentId,
        allowSubAgents: true,
        subAgentIds: ctx.executionSteps.toolLoop.subAgentIds,
      },
      agents,
    ).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
    }))
  }

  if (invokeAgentTargets.length === 0) return null

  return { invokeAgentTargets }
}

function formatTargetLine(target: SubAgentTargetEntry): string {
  return `- \`${target.id}\` — ${target.name}: ${target.description}`
}

export function formatSubAgentInstructionsBlock(
  catalog: SubAgentCatalog,
  availableToolNames: readonly string[],
): string {
  const names = new Set(availableToolNames)
  const hasInvokeGated = [...INVOKE_GATED_TOOL_NAMES].some((n) => names.has(n))

  const lines: string[] = ['### Sub-agent delegation', '']

  const routing: string[] = ['**Routing**']
  if (hasInvokeGated) {
    routing.push(
      '- Single specialist → `invoke_agent` with exact `agentId` from the list below',
      '- Parallel specialists → `invoke_agents` with `wait=false`, then `wait_for_sub_agent_runs`',
    )
  }
  routing.push(
    '- Pass a concrete `task` (goal, scope, success criteria). Use `wait=false` on `invoke_agent` to run without blocking.',
  )
  lines.push(...routing, '')

  if (hasInvokeGated && catalog.invokeAgentTargets.length > 0) {
    lines.push('**Agents (`invoke_agent` / `invoke_agents`)**')
    lines.push(...catalog.invokeAgentTargets.map(formatTargetLine), '')
  }

  return lines.join('\n').trim()
}

export function formatSubAgentToolSuffix(
  toolName: string,
  catalog: SubAgentCatalog,
): string | null {
  if (toolName === INVOKE_AGENT_TOOL_NAME || toolName === INVOKE_AGENTS_TOOL_NAME) {
    if (catalog.invokeAgentTargets.length === 0) return null
    const lines = catalog.invokeAgentTargets.map(
      (t) => `  - \`${t.id}\`: ${t.description}`,
    )
    return `\n\nAllowed agents:\n${lines.join('\n')}`
  }

  return null
}
