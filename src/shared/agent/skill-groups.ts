import { resolveAgentSkillId } from './workspace-required-skills'

/** Agent fields needed to resolve skill-group display. */
export type SkillGroupAgentRef = {
  id: string
  name: string
  skillId?: string | null
  skillGroup?: string | null
  skillGroupLabel?: string | null
  skillVariant?: string | null
  skillVariantLabel?: string | null
  skillGroupOrder?: number | null
  skillVariantOrder?: number | null
  skillGroupPrimary?: boolean | null
  enabled?: boolean
}

export type AgentPickerAgentOption = {
  id: string
  name: string
  description?: string
  skillGroup?: string | null
  skillGroupLabel?: string | null
  skillVariant?: string | null
  skillVariantLabel?: string | null
  /** Full label for headers and compact UI, e.g. "Coding › Review". */
  displayName: string
  /** Row label under a group header (variant only). */
  shortLabel: string
}

export type AgentPickerEntry =
  | { kind: 'header'; groupId: string; label: string }
  | { kind: 'agent'; option: AgentPickerAgentOption }

const DEFAULT_GROUP_ORDER = 999
const DEFAULT_VARIANT_ORDER = 999

function parseOptionalInt(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function parseOptionalBool(value: unknown): boolean | undefined {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
}

/** Parse skill-group fields from properties.md frontmatter lines. */
export function parseSkillGroupFromFrontmatter(
  fm: Record<string, unknown>,
): Pick<
  SkillGroupAgentRef,
  | 'skillGroup'
  | 'skillGroupLabel'
  | 'skillVariant'
  | 'skillVariantLabel'
  | 'skillGroupOrder'
  | 'skillVariantOrder'
  | 'skillGroupPrimary'
> {
  const group = typeof fm.group === 'string' ? fm.group.trim() : ''
  if (!group) return {}

  return {
    skillGroup: group,
    skillGroupLabel:
      typeof fm.group_label === 'string' && fm.group_label.trim()
        ? fm.group_label.trim()
        : undefined,
    skillVariant:
      typeof fm.variant === 'string' && fm.variant.trim()
        ? fm.variant.trim()
        : undefined,
    skillVariantLabel:
      typeof fm.variant_label === 'string' && fm.variant_label.trim()
        ? fm.variant_label.trim()
        : undefined,
    skillGroupOrder: parseOptionalInt(fm.group_order),
    skillVariantOrder: parseOptionalInt(fm.variant_order),
    skillGroupPrimary: parseOptionalBool(fm.group_primary),
  }
}

export function agentHasSkillGroup(
  agent: Pick<SkillGroupAgentRef, 'skillGroup'>,
): boolean {
  return Boolean(agent.skillGroup?.trim())
}

export function formatAgentGroupDisplayName(
  agent: Pick<
    SkillGroupAgentRef,
    'name' | 'skillGroup' | 'skillGroupLabel' | 'skillVariant' | 'skillVariantLabel'
  >,
): string {
  const groupId = agent.skillGroup?.trim()
  if (!groupId) return agent.name.trim() || 'Agent'

  const groupLabel = agent.skillGroupLabel?.trim() || groupId
  const variantLabel =
    agent.skillVariantLabel?.trim() ||
    agent.skillVariant?.trim() ||
    agent.name.trim()

  if (!variantLabel || variantLabel.toLowerCase() === groupLabel.toLowerCase()) {
    return groupLabel
  }
  return `${groupLabel} › ${variantLabel}`
}

export function toAgentPickerOption(
  agent: SkillGroupAgentRef & { description?: string },
): AgentPickerAgentOption {
  const displayName = formatAgentGroupDisplayName(agent)
  const shortLabel =
    agent.skillVariantLabel?.trim() ||
    agent.skillVariant?.trim() ||
    agent.name.trim() ||
    displayName
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    skillGroup: agent.skillGroup ?? null,
    skillGroupLabel: agent.skillGroupLabel ?? null,
    skillVariant: agent.skillVariant ?? null,
    skillVariantLabel: agent.skillVariantLabel ?? null,
    displayName,
    shortLabel,
  }
}

function groupSortKey(agent: SkillGroupAgentRef): string {
  const order = agent.skillGroupOrder ?? DEFAULT_GROUP_ORDER
  const label = agent.skillGroupLabel?.trim() || agent.skillGroup?.trim() || ''
  return `${String(order).padStart(5, '0')}:${label.toLowerCase()}`
}

function variantSortKey(agent: SkillGroupAgentRef): string {
  const order = agent.skillVariantOrder ?? DEFAULT_VARIANT_ORDER
  const label =
    agent.skillVariantLabel?.trim() ||
    agent.skillVariant?.trim() ||
    agent.name.trim()
  return `${String(order).padStart(5, '0')}:${label.toLowerCase()}`
}

/** Flat picker list with optional group headers (ungrouped agents first). */
export function agentPickerRowLabel(
  option: AgentPickerAgentOption,
  groupedUnderHeader: boolean,
): string {
  if (groupedUnderHeader) return option.shortLabel
  return option.displayName
}

export function buildAgentPickerEntries(
  agents: readonly SkillGroupAgentRef[],
): AgentPickerEntry[] {
  const enabled = agents.filter((agent) => agent.enabled !== false)
  const ungrouped = enabled.filter((agent) => !agentHasSkillGroup(agent))
  const grouped = enabled.filter((agent) => agentHasSkillGroup(agent))

  const byGroup = new Map<string, SkillGroupAgentRef[]>()
  for (const agent of grouped) {
    const groupId = agent.skillGroup!.trim()
    const list = byGroup.get(groupId) ?? []
    list.push(agent)
    byGroup.set(groupId, list)
  }

  const groupIds = [...byGroup.keys()].sort((a, b) => {
    const agentsA = byGroup.get(a) ?? []
    const agentsB = byGroup.get(b) ?? []
    const keyA = agentsA[0] ? groupSortKey(agentsA[0]) : a
    const keyB = agentsB[0] ? groupSortKey(agentsB[0]) : b
    return keyA.localeCompare(keyB)
  })

  const entries: AgentPickerEntry[] = []

  for (const agent of ungrouped.sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    entries.push({ kind: 'agent', option: toAgentPickerOption(agent) })
  }

  for (const groupId of groupIds) {
    const members = (byGroup.get(groupId) ?? []).slice().sort((a, b) =>
      variantSortKey(a).localeCompare(variantSortKey(b)),
    )
    if (members.length === 0) continue

    const headerLabel =
      members[0]?.skillGroupLabel?.trim() || groupId

    if (members.length > 1) {
      entries.push({ kind: 'header', groupId, label: headerLabel })
    }

    for (const agent of members) {
      entries.push({ kind: 'agent', option: toAgentPickerOption(agent) })
    }
  }

  return entries
}

export function listSelectableAgentPickerOptions(
  entries: readonly AgentPickerEntry[],
): AgentPickerAgentOption[] {
  return entries
    .filter((entry): entry is { kind: 'agent'; option: AgentPickerAgentOption } =>
      entry.kind === 'agent',
    )
    .map((entry) => entry.option)
}

export type SkillSwitchTarget = {
  skillId: string
  name: string
  agentId: string
  displayName: string
  skillGroup?: string | null
  skillGroupLabel?: string | null
}

export function listSkillSwitchTargetsGrouped(
  agents: readonly SkillGroupAgentRef[],
): SkillSwitchTarget[] {
  const out: SkillSwitchTarget[] = []
  const seen = new Set<string>()

  for (const agent of agents) {
    if (agent.enabled === false) continue
    const skillId = resolveAgentSkillId(agent)
    if (!skillId || seen.has(skillId)) continue
    seen.add(skillId)
    out.push({
      skillId,
      name: agent.name,
      agentId: agent.id,
      displayName: formatAgentGroupDisplayName(agent),
      skillGroup: agent.skillGroup ?? null,
      skillGroupLabel: agent.skillGroupLabel ?? null,
    })
  }

  return out.sort((a, b) => {
    const groupA = a.skillGroupLabel ?? a.skillGroup ?? ''
    const groupB = b.skillGroupLabel ?? b.skillGroup ?? ''
    if (groupA && groupB && groupA !== groupB) {
      return groupA.localeCompare(groupB)
    }
    if (groupA && !groupB) return -1
    if (!groupA && groupB) return 1
    return a.displayName.localeCompare(b.displayName)
  })
}

export function formatSkillSwitchHelpGrouped(
  agents: readonly SkillGroupAgentRef[],
): string {
  const targets = listSkillSwitchTargetsGrouped(agents)
  const lines = [
    '/skill:<id> — Switch to another skill agent',
    '/skill:install <url> — Install a skill from GitHub (Coding agent)',
  ]
  if (targets.length === 0) return lines.join('\n')

  const grouped = new Map<string, SkillSwitchTarget[]>()
  const ungrouped: SkillSwitchTarget[] = []

  for (const target of targets) {
    const groupKey = target.skillGroupLabel ?? target.skillGroup
    if (!groupKey) {
      ungrouped.push(target)
      continue
    }
    const list = grouped.get(groupKey) ?? []
    list.push(target)
    grouped.set(groupKey, list)
  }

  lines.push('Skills:')
  for (const target of ungrouped) {
    lines.push(`  /skill:${target.skillId} (${target.displayName})`)
  }
  for (const [, members] of [...grouped.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const groupLabel =
      members[0]?.skillGroupLabel ?? members[0]?.skillGroup ?? 'Group'
    if (members.length === 1) {
      const only = members[0]!
      lines.push(`  /skill:${only.skillId} (${only.displayName})`)
      continue
    }
    lines.push(`  ${groupLabel}:`)
    for (const member of members) {
      lines.push(`    /skill:${member.skillId} (${member.displayName})`)
    }
  }

  return lines.join('\n')
}
