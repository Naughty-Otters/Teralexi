import {
  filterSubAgentTargetsByQuery,
  subAgentMentionQueryLooksLikePath,
  type SubAgentTarget,
} from '@shared/agent/sub-agent-targets'

/** Whether @ at cursor should open the sub-agent menu (vs file search). */
export function shouldPreferSubAgentMentionMenu(
  query: string,
  subAgentMentionEnabled: boolean,
  targets: readonly SubAgentTarget[],
): boolean {
  if (!subAgentMentionEnabled) return false
  if (subAgentMentionQueryLooksLikePath(query)) return false
  if (targets.length === 0) return true
  return true
}

export function filterSubAgentMentionMenuItems(
  targets: readonly SubAgentTarget[],
  query: string,
): SubAgentTarget[] {
  return filterSubAgentTargetsByQuery(targets, query)
}
