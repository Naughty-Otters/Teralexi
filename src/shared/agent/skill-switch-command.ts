import { resolveAgentSkillId } from './workspace-required-skills'
import { formatSkillSwitchHelpGrouped } from './skill-groups'

/** Matches `/skill:coding` but not `/skill:install …`. */
export const SKILL_SWITCH_COMMAND_RE =
  /^\/skill:(?!install$)([\w-]+)$/i

export type SkillSwitchAgentRef = {
  id: string
  skillId?: string | null
  name: string
  enabled?: boolean
}

export function normalizeSkillSwitchTarget(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.toLowerCase().startsWith('skill:')) {
    return trimmed.slice('skill:'.length)
  }
  return trimmed
}

export function parseSkillSwitchCommand(text: string): string | null {
  const trimmed = text.trim()
  const match = trimmed.match(SKILL_SWITCH_COMMAND_RE)
  if (!match?.[1]) return null
  return normalizeSkillSwitchTarget(match[1])
}

export function isSkillSwitchCommand(text: string): boolean {
  return parseSkillSwitchCommand(text) !== null
}

export function resolveAgentIdForSkillSwitch(
  agents: readonly SkillSwitchAgentRef[],
  target: string,
): string | null {
  const normalized = normalizeSkillSwitchTarget(target).toLowerCase()
  if (!normalized) return null

  const enabled = agents.filter((agent) => agent.enabled !== false)

  const exactId = enabled.find(
    (agent) => agent.id.trim().toLowerCase() === normalized,
  )
  if (exactId) return exactId.id

  const prefixedId = enabled.find(
    (agent) => agent.id.trim().toLowerCase() === `skill:${normalized}`,
  )
  if (prefixedId) return prefixedId.id

  const bySkillId = enabled.find((agent) => {
    const skillId = resolveAgentSkillId(agent)
    return skillId?.toLowerCase() === normalized
  })
  if (bySkillId) return bySkillId.id

  const byName = enabled.find(
    (agent) => agent.name.trim().toLowerCase() === normalized,
  )
  if (byName) return byName.id

  return null
}

export function listSkillSwitchTargets(
  agents: readonly SkillSwitchAgentRef[],
): Array<{ skillId: string; name: string; agentId: string }> {
  const out: Array<{ skillId: string; name: string; agentId: string }> = []
  const seen = new Set<string>()

  for (const agent of agents) {
    if (agent.enabled === false) continue
    const skillId = resolveAgentSkillId(agent)
    if (!skillId || seen.has(skillId)) continue
    seen.add(skillId)
    out.push({ skillId, name: agent.name, agentId: agent.id })
  }

  return out.sort((a, b) => a.skillId.localeCompare(b.skillId))
}

export function formatSkillSwitchHelp(
  agents: readonly SkillSwitchAgentRef[],
): string {
  return formatSkillSwitchHelpGrouped(agents)
}
