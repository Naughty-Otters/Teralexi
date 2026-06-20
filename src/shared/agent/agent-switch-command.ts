import { resolveAgentSkillId } from './workspace-required-skills'

export type AgentSwitchAgentRef = {
  id: string
  skillId?: string | null
  name: string
  enabled?: boolean
}

export type AgentSlashAction =
  | { kind: 'status' }
  | { kind: 'pick' }
  | { kind: 'switch'; target: string }

export const AGENT_SLASH_COMMAND_RE = /^\/agent(?:\s+([\s\S]*))?$/i

export function parseAgentSlashCommand(text: string): AgentSlashAction | null {
  const trimmed = text.trim()
  const match = trimmed.match(AGENT_SLASH_COMMAND_RE)
  if (!match) return null

  const argsRaw = (match[1] ?? '').trim()
  if (!argsRaw) return { kind: 'status' }

  const lower = argsRaw.toLowerCase()
  if (lower === 'pick') return { kind: 'pick' }

  const quoted = argsRaw.match(/^["'](.+)["']$/)
  if (quoted?.[1]?.trim()) {
    return { kind: 'switch', target: quoted[1].trim() }
  }

  return { kind: 'switch', target: argsRaw }
}

export function isAgentSlashCommand(text: string): boolean {
  return parseAgentSlashCommand(text) !== null
}

export function normalizeAgentSwitchTarget(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.toLowerCase().startsWith('skill:')) {
    return trimmed.slice('skill:'.length)
  }
  return trimmed
}

export function resolveAgentIdForAgentSwitch(
  agents: readonly AgentSwitchAgentRef[],
  target: string,
): string | null {
  const normalized = normalizeAgentSwitchTarget(target).toLowerCase()
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

export function agentSwitchTargetLabel(
  agent: AgentSwitchAgentRef,
): string {
  const skillId = resolveAgentSkillId(agent)
  if (skillId) return skillId
  return agent.id
}

export function listAgentSwitchTargets(
  agents: readonly AgentSwitchAgentRef[],
): Array<{ agentId: string; name: string; label: string }> {
  return agents
    .filter((agent) => agent.enabled !== false)
    .map((agent) => ({
      agentId: agent.id,
      name: agent.name,
      label: agentSwitchTargetLabel(agent),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function describeAgentSlashStatus(
  selectedAgentId: string | null | undefined,
  agents: readonly AgentSwitchAgentRef[],
): string {
  const id = selectedAgentId?.trim()
  if (!id) return 'Agent: none selected'

  const agent = agents.find((entry) => entry.id === id)
  if (agent) {
    return `Agent: ${agent.name} (${agent.id})`
  }
  return `Agent: ${id}`
}

export function formatAgentSwitchHelp(
  agents: readonly AgentSwitchAgentRef[],
): string {
  const lines = [
    '/agent — Show the current agent and available agents',
    '/agent pick — Open the agent picker menu',
    '/agent <name|id> — Switch to another enabled agent',
  ]
  const targets = listAgentSwitchTargets(agents)
  if (targets.length > 0) {
    lines.push(
      'Agents: ' +
        targets.map((t) => `${t.name} (/agent ${t.label})`).join(', '),
    )
  }
  return lines.join('\n')
}
