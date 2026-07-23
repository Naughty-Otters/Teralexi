import {
  isSubAgentTargetAllowed,
  resolveAllowAsSubAgent,
  resolveAllowSubAgents,
  type SubAgentSettings,
} from './sub-agent-settings'

export type SubAgentTargetAgent = SubAgentSettings & {
  id: string
  name: string
  description?: string
}

export type SubAgentTarget = {
  id: string
  name: string
  description: string
  mentionSlug: string
}

export type ResolvedSubAgentMention = {
  agentId: string
  mentionSlug: string
  task: string
}

/** Normalize agent name for @mention matching (lowercase, spaces → hyphens). */
export function subAgentMentionSlug(nameOrId: string): string {
  return nameOrId
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
}

function toSubAgentTarget(agent: SubAgentTargetAgent): SubAgentTarget {
  const name = agent.name?.trim() || agent.id
  const desc = agent.description?.trim()
  const idSlug = subAgentMentionSlug(agent.id)
  const nameSlug = subAgentMentionSlug(name)
  const mentionSlug = idSlug || nameSlug || agent.id
  return {
    id: agent.id,
    name,
    description: desc || name,
    mentionSlug,
  }
}

/** Agents the caller may @-mention (same rules as invoke_agents targets). */
export function resolveDelegatableSubAgentTargets(
  caller: SubAgentSettings & { id?: string },
  allAgents: readonly SubAgentTargetAgent[],
): SubAgentTarget[] {
  if (!resolveAllowSubAgents(caller.allowSubAgents)) return []

  const callerId = caller.id?.trim()
  const allowList = caller.subAgentIds

  return allAgents
    .filter((agent) => {
      if (!resolveAllowAsSubAgent(agent.allowAsSubAgent)) return false
      if (callerId && agent.id === callerId) return false
      return isSubAgentTargetAllowed(agent.id, allowList)
    })
    .map(toSubAgentTarget)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function filterSubAgentTargetsByQuery(
  targets: readonly SubAgentTarget[],
  query: string,
): SubAgentTarget[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...targets]
  return targets.filter((t) => {
    const slug = t.mentionSlug.toLowerCase()
    const id = t.id.toLowerCase()
    const name = t.name.toLowerCase()
    return slug.startsWith(q) || id.startsWith(q) || name.includes(q)
  })
}

export function resolveSubAgentTargetBySlug(
  slug: string,
  targets: readonly SubAgentTarget[],
): SubAgentTarget | undefined {
  const normalized = slug.trim().toLowerCase()
  if (!normalized) return undefined
  return targets.find((t) => {
    const id = t.id.toLowerCase()
    const mention = t.mentionSlug.toLowerCase()
    const name = subAgentMentionSlug(t.name)
    return (
      normalized === id ||
      normalized === mention ||
      normalized === name ||
      id.endsWith(`:${normalized}`) ||
      id.endsWith(`/${normalized}`)
    )
  })
}

const MENTION_TOKEN_RE = /(?:^|\s)@([\w-]+)/g

/** First @slug token that is not path-like (for send-time validation). */
export function extractFirstSubAgentMentionSlug(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const match = trimmed.match(/(?:^|\s)@([\w./\-]+)/)
  const query = match?.[1]?.trim()
  if (!query || subAgentMentionQueryLooksLikePath(query)) return null
  const slug = query.match(/^([\w-]+)/)?.[1]
  return slug?.trim() || null
}

/** True when @ query should use file search (path-like) instead of sub-agent menu. */
export function subAgentMentionQueryLooksLikePath(query: string): boolean {
  return /[./]/.test(query)
}

/**
 * First resolvable @slug in text; task is the full message with that token removed.
 */
export function resolveSubAgentMention(
  text: string,
  targets: readonly SubAgentTarget[],
): ResolvedSubAgentMention | null {
  const trimmed = text.trim()
  if (!trimmed || targets.length === 0) return null

  MENTION_TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MENTION_TOKEN_RE.exec(trimmed)) !== null) {
    const slug = match[1]?.trim()
    if (!slug) continue
    const target = resolveSubAgentTargetBySlug(slug, targets)
    if (!target) continue

    const token = match[0].trimStart()
    const task = trimmed
      .replace(token, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!task) return null

    return {
      agentId: target.id,
      mentionSlug: slug,
      task,
    }
  }
  return null
}
