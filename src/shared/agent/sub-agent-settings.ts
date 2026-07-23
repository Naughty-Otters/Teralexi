import { resolveToolLoopMaxIterations } from './tool-loop'

/** Per-agent sub-agent / delegation settings (persisted in agent_configurations). */
export type SubAgentSettings = {
  /** When false, skill_chain / invoke_skill / invoke_agents cannot target this agent. */
  allowAsSubAgent?: boolean
  /** When true, tool loop exposes gated `invoke_agents` (in addition to always-on `invoke_skill`). */
  allowSubAgents?: boolean
  /** Allow-list for `invoke_agents`; null/empty = any sub-agent-eligible agent. */
  subAgentIds?: string[] | null
}

export const DEFAULT_ALLOW_AS_SUB_AGENT = true
export const DEFAULT_ALLOW_SUB_AGENTS = true

export function resolveAllowAsSubAgent(value: boolean | undefined): boolean {
  return value !== false
}

export function resolveAllowSubAgents(value: boolean | undefined): boolean {
  return value !== false
}

/** Empty/null allow-list means every sub-agent-eligible target is permitted. */
export function subAgentTargetsAllowAll(
  subAgentIds: string[] | null | undefined,
): boolean {
  return (subAgentIds ?? []).length === 0
}

export function isSubAgentTargetAllowed(
  agentId: string,
  subAgentIds: string[] | null | undefined,
): boolean {
  if (subAgentTargetsAllowAll(subAgentIds)) return true
  return (subAgentIds ?? []).includes(agentId)
}

/** Toggle one target in the invoke_agents allow-list; empty result means allow all. */
export function toggleSubAgentTargetSelection(
  agentId: string,
  checked: boolean,
  subAgentIds: string[] | null | undefined,
  allDelegatableIds: readonly string[],
): string[] {
  const all = [...new Set(allDelegatableIds)]
  const current = subAgentIds ?? []

  if (subAgentTargetsAllowAll(current)) {
    if (checked) return []
    return all.filter((id) => id !== agentId)
  }

  const next = new Set(current)
  if (checked) next.add(agentId)
  else next.delete(agentId)

  const nextArr = [...next]
  if (
    nextArr.length === all.length &&
    all.every((id) => next.has(id))
  ) {
    return []
  }
  return nextArr
}

type ToolLoopWithSubAgents = {
  tools?: unknown[]
  maxIterations?: number
  allowSubAgents?: boolean
  subAgentIds?: string[]
}

type StepsWithToolLoop = {
  planning?: string
  skills?: string
  summary?: string
  report?: string
  toolLoop?: ToolLoopWithSubAgents
}

type AgentWithSteps = SubAgentSettings & {
  executionSteps?: StepsWithToolLoop
  availableSkillTools?: unknown[]
  toolLoopMaxIterations?: number
}

function stepsHaveContent(steps: StepsWithToolLoop): boolean {
  return Boolean(
    steps.planning?.trim() ||
      steps.skills?.trim() ||
      steps.summary?.trim() ||
      steps.report?.trim() ||
      (steps.toolLoop?.tools?.length ?? 0) > 0 ||
      steps.toolLoop?.allowSubAgents ||
      steps.toolLoop?.maxIterations != null,
  )
}

/** Merge persisted sub-agent flags into `executionSteps.toolLoop` for the engine. */
export function applySubAgentSettingsToExecutionSteps(agent: AgentWithSteps): void {
  const steps: StepsWithToolLoop = { ...(agent.executionSteps ?? {}) }
  const prevToolLoop = steps.toolLoop ?? {}
  const tools = prevToolLoop.tools ?? agent.availableSkillTools ?? []
  const maxIterations = resolveToolLoopMaxIterations(
    agent.toolLoopMaxIterations ?? prevToolLoop.maxIterations,
  )

  if (agent.allowSubAgents === false) {
    const { allowSubAgents: _a, subAgentIds: _s, ...rest } = prevToolLoop
    if (Object.keys(rest).length > 0 || tools.length > 0) {
      steps.toolLoop = { ...rest, tools, maxIterations }
    } else {
      delete steps.toolLoop
    }
    agent.executionSteps = stepsHaveContent(steps) ? steps : undefined
    return
  }

  steps.toolLoop = {
    ...prevToolLoop,
    tools,
    maxIterations,
    allowSubAgents: true,
    ...(agent.subAgentIds && agent.subAgentIds.length > 0
      ? { subAgentIds: [...new Set(agent.subAgentIds)] }
      : {}),
  }
  agent.executionSteps = stepsHaveContent(steps) ? steps : undefined
}
