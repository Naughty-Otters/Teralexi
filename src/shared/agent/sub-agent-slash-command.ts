import {
  resolveSubAgentMention,
  resolveSubAgentTargetBySlug,
  type ResolvedSubAgentMention,
  type SubAgentTarget,
} from './sub-agent-targets'

export const SUB_AGENT_SLASH_COMMAND_RE = /^\/sub-agent(?:\s+([\s\S]*))?$/i

export function isSubAgentSlashCommand(text: string): boolean {
  return SUB_AGENT_SLASH_COMMAND_RE.test(text.trim())
}

/**
 * Parse `/sub-agent @slug task` or `/sub-agent slug task`.
 * Returns null when the command is incomplete or the slug/task cannot be resolved.
 */
export function parseSubAgentSlashCommand(
  text: string,
  targets: readonly SubAgentTarget[],
): ResolvedSubAgentMention | null {
  const trimmed = text.trim()
  const match = trimmed.match(SUB_AGENT_SLASH_COMMAND_RE)
  if (!match) return null

  const args = (match[1] ?? '').trim()
  if (!args) return null

  const direct = resolveSubAgentMention(args, targets)
  if (direct) return direct

  const firstSpace = args.indexOf(' ')
  const slugToken = (firstSpace === -1 ? args : args.slice(0, firstSpace)).replace(
    /^@/,
    '',
  )
  if (!slugToken) return null

  const task = firstSpace === -1 ? '' : args.slice(firstSpace + 1).trim()
  if (!task) return null

  const target = resolveSubAgentTargetBySlug(slugToken, targets)
  if (!target) return null

  return {
    agentId: target.id,
    mentionSlug: slugToken,
    task,
  }
}

export function formatSubAgentSlashHelp(
  targets: readonly SubAgentTarget[],
): string {
  const lines = [
    '/sub-agent @<slug> <task> — Delegate directly to a sub-agent',
    '/sub-agent <slug> <task> — Same as above without @',
  ]
  if (targets.length > 0) {
    lines.push(
      'Sub-agents: ' +
        targets.map((t) => `@${t.mentionSlug} (${t.name})`).join(', '),
    )
  }
  return lines.join('\n')
}
