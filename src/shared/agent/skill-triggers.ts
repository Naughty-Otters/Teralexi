import {
  formatAgentGroupDisplayName,
  type SkillGroupAgentRef,
} from './skill-groups'
import { resolveAgentSkillId } from './workspace-required-skills'

/** Agent fields needed to resolve skill routing (variants + sub-agents). */
export type SkillRoutingAgentRef = SkillGroupAgentRef & {
  description?: string
  skillsPrompt?: string
  allowAsSubAgent?: boolean
}

export type SkillRoutingEntry = {
  agentId: string
  skillId: string | null
  displayName: string
  description: string
  /** Extracted `### Trigger` body from skill.md, when present. */
  trigger: string | null
  /** User or model can switch with `/skill:{skillId}`. */
  canSwitch: boolean
  /** Delegatable via `invoke_agents`. */
  canInvoke: boolean
}

/** Pull the `### Trigger` section from a skill.md body. */
export function extractTriggerSection(markdown: string | undefined | null): string | null {
  const text = (markdown ?? '').trim()
  if (!text) return null

  const lines = text.split(/\r?\n/)
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,3}\s+Trigger\s*$/.test(lines[i] ?? '')) {
      start = i + 1
      break
    }
  }
  if (start < 0) return null

  const bodyLines: string[] = []
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (/^#{2,3}\s/.test(line)) break
    if (line.trim() === '---') break
    bodyLines.push(line)
  }

  const body = bodyLines.join('\n').trim()
  return body.length > 0 ? body : null
}

function variantSortKey(agent: SkillGroupAgentRef): string {
  const order = agent.skillVariantOrder ?? 999
  const label =
    agent.skillVariantLabel?.trim() ||
    agent.skillVariant?.trim() ||
    agent.name.trim()
  return `${String(order).padStart(5, '0')}:${label.toLowerCase()}`
}

function routingEntryFromAgent(
  agent: SkillRoutingAgentRef,
  options: { canSwitch: boolean; canInvoke: boolean },
): SkillRoutingEntry {
  const skillId = resolveAgentSkillId(agent)
  const description = agent.description?.trim() || agent.name.trim()
  return {
    agentId: agent.id,
    skillId,
    displayName: formatAgentGroupDisplayName(agent),
    description,
    trigger: extractTriggerSection(agent.skillsPrompt) ?? description,
    canSwitch: options.canSwitch && Boolean(skillId),
    canInvoke: options.canInvoke,
  }
}

/** Other enabled variants in the same skill group (excludes caller). */
export function resolveSkillGroupSiblingTargets(
  caller: SkillRoutingAgentRef,
  allAgents: readonly SkillRoutingAgentRef[],
): SkillRoutingEntry[] {
  const groupId = caller.skillGroup?.trim()
  if (!groupId) return []

  return allAgents
    .filter((agent) => {
      if (agent.enabled === false) return false
      if (agent.id === caller.id) return false
      return agent.skillGroup?.trim() === groupId
    })
    .slice()
    .sort((a, b) => variantSortKey(a).localeCompare(variantSortKey(b)))
    .map((agent) =>
      routingEntryFromAgent(agent, { canSwitch: true, canInvoke: false }),
    )
}

/** Merge variant and sub-agent entries; sub-agent flags win on duplicate agent ids. */
export function mergeSkillRoutingEntries(
  variants: readonly SkillRoutingEntry[],
  subAgents: readonly SkillRoutingEntry[],
): SkillRoutingEntry[] {
  const byId = new Map<string, SkillRoutingEntry>()

  for (const entry of variants) {
    byId.set(entry.agentId, { ...entry })
  }

  for (const entry of subAgents) {
    const existing = byId.get(entry.agentId)
    if (existing) {
      byId.set(entry.agentId, {
        ...existing,
        canInvoke: entry.canInvoke,
        trigger: entry.trigger ?? existing.trigger,
        description: entry.description || existing.description,
      })
    } else {
      byId.set(entry.agentId, { ...entry })
    }
  }

  return [...byId.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  )
}

function formatEntryRouting(entry: SkillRoutingEntry, hasInvokeAgent: boolean): string {
  const routes: string[] = []
  if (entry.canSwitch && entry.skillId) {
    routes.push(`switch: \`/skill:${entry.skillId}\``)
  }
  if (entry.canInvoke && hasInvokeAgent) {
    routes.push(`delegate: \`invoke_agents\` with \`${entry.agentId}\``)
  }
  if (routes.length === 0) return ''
  return ` (${routes.join('; ')})`
}

export function formatSkillRoutingInstructionsBlock(
  entries: readonly SkillRoutingEntry[],
  options: {
    hasInvokeAgent: boolean
    groupLabel?: string | null
  },
): string {
  if (entries.length === 0) return ''

  const lines: string[] = ['### Related skills & sub-agents', '']

  if (options.groupLabel?.trim()) {
    lines.push(
      `When the task fits a sibling in **${options.groupLabel.trim()}**, prefer routing instead of improvising with the wrong tools.`,
      '',
    )
  }

  lines.push(
    '**Routing**',
    '- Match the user request to a trigger below before continuing with the wrong skill.',
  )

  if (options.hasInvokeAgent) {
    lines.push(
      '- **Priority** Cursor built-in profiles — prefer these before doing the same work in the parent:',
      '  - `explore` — codebase search (isolates noisy grep/read intermediate output)',
      '  - `bash` — series of commands via the `shell` tool only (no `bash`/`run_script` tools)',
      '  - `browser` — web scrape / browser MCP (isolates DOM/screenshot noise)',
      '- Orchestration after built-ins → `architect`/`plan` (plan only) → `coder` (implement; auto-merge)',
      '- Delegate via `invoke_agents` only (one-element `runs` for a single child; multiple for parallel)',
      '- Always waits for results — consume the per-run **brief** (`summary`, `filesTouched`, `status`, `worktreeOutcome`)',
      '- File changes are **auto-merged** into the workspace — do not ask the user to merge/PR/discard',
      '- Do **not** re-invoke just because a summary has a length cap notice — read the sub-agent bubble',
      '- Do **not** re-run explore/bash/browser loops in the parent after a successful brief — consume the summary',
    )
  }

  if (entries.some((e) => e.canSwitch)) {
    lines.push(
      '- Or ask the user to switch with `/skill:<id>` when delegation is not available',
    )
  }

  lines.push('', '**When to use each**')

  for (const entry of entries) {
    const routing = formatEntryRouting(entry, options.hasInvokeAgent)
    lines.push(`- **${entry.displayName}** (\`${entry.agentId}\`)${routing}`)
    const trigger = entry.trigger?.trim()
    if (trigger) {
      for (const line of trigger.split('\n')) {
        lines.push(`  ${line}`)
      }
    } else {
      lines.push(`  ${entry.description}`)
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

export function formatSkillRoutingToolSuffix(
  entries: readonly SkillRoutingEntry[],
): string | null {
  if (entries.length === 0) return null
  const lines = entries.map((entry) => {
    const trigger = entry.trigger?.trim() || entry.description
    const firstLine = trigger.split('\n').find((l) => l.trim())?.trim() ?? entry.description
    return `  - \`${entry.agentId}\` (${entry.displayName}): ${firstLine}`
  })
  return `\n\nRelated skills:\n${lines.join('\n')}`
}
