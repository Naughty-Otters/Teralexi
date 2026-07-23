import type { SkillTool } from './types'
import { MANDATORY_TOOL_NAMES } from '@shared/agent/mandatory-tools'
import { NO_TOOLSET_EXPANSION_SKILL_IDS } from '@shared/agent/skill-workspace-tool-defaults'
import { PLAN_MODE_TOOL_NAMES } from '@toolSet/planning/constants'
import { UNIVERSAL_SUB_AGENT_TOOL_NAMES } from '@toolSet/sub-agents/constants'

/** Always-on tools: mandatory + plan enter/exit + core sub-agent invoke tools. */
const UNIVERSAL_GLOBAL_TOOL_NAMES = new Set<string>([
  ...MANDATORY_TOOL_NAMES,
  ...PLAN_MODE_TOOL_NAMES,
  ...UNIVERSAL_SUB_AGENT_TOOL_NAMES,
])

/** Plan/sub-agent tools without automatic file/git/workspace reads. */
const SANDBOX_ONLY_UNIVERSAL_TOOL_NAMES = new Set<string>([
  ...MANDATORY_TOOL_NAMES,
  ...PLAN_MODE_TOOL_NAMES,
  ...UNIVERSAL_SUB_AGENT_TOOL_NAMES,
])

function universalGlobalToolNamesForSkill(skillId?: string): Set<string> {
  if (
    skillId &&
    (NO_TOOLSET_EXPANSION_SKILL_IDS as readonly string[]).includes(skillId) &&
    skillId === 'default'
  ) {
    return SANDBOX_ONLY_UNIVERSAL_TOOL_NAMES
  }
  return UNIVERSAL_GLOBAL_TOOL_NAMES
}

/** Tag prefix for tools owned by a single skill (`actions/`). */
export function skillActionTag(skillId: string): string {
  return `skill:${skillId}`
}

export function tagToolsForSkill(
  tools: SkillTool[],
  skillId: string,
): SkillTool[] {
  const tag = skillActionTag(skillId)
  return tools.map((tool) => {
    const cleaned = (tool.tags ?? []).filter(
      (t) => typeof t === 'string' && t.trim() !== '',
    )
    return {
      ...tool,
      tags: Array.from(new Set([...cleaned, tag])),
    }
  })
}

/**
 * Build the tool catalog for one skill: shared toolSet subset (from
 * `allowed_tools` when set) plus this skill's `actions/` tools only.
 */
export function resolveSkillToolCatalog(
  globalTools: SkillTool[],
  skillActionTools: SkillTool[],
  allowedTools?: string[],
  skillId?: string,
): SkillTool[] {
  const actionNames = new Set(skillActionTools.map((tool) => tool.name))
  const allowed = (allowedTools ?? [])
    .map((name) => name.trim().replace(/^`|`$/g, ''))
    .filter(Boolean)
  const universal = universalGlobalToolNamesForSkill(skillId)

  const globalFiltered =
    allowed.length > 0
      ? globalTools.filter(
          (tool) =>
            !actionNames.has(tool.name) &&
            (allowed.includes(tool.name) || universal.has(tool.name)),
        )
      : globalTools.filter((tool) => !actionNames.has(tool.name))

  return [...globalFiltered, ...skillActionTools]
}
