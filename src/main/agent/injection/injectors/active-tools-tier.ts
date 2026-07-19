import {
  DEFAULT_SKILL_TOOLSET_TAGS,
  defaultToolsetTagsForSkill,
  toolNamesMatchingTags,
} from '@shared/agent/skill-workspace-tool-defaults'
import { MANDATORY_TOOL_NAMES } from '@shared/agent/mandatory-tools'
import { ACTIVE_TOOLS_TIER_BUNDLE_MARKER } from '@main/agent/harness-bundle-markers'
import { resolveDefaultActiveToolNames } from '../../coding/default-active-tools'
import { isPlanModeActive } from '../../coding/plan-mode-state'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

/** Category tags used by shared toolSet modules (not skill-owned actions). */
const KNOWN_TOOLSET_CATEGORY_TAGS = new Set<string>([
  ...DEFAULT_SKILL_TOOLSET_TAGS,
  'code-intelligence',
  'planning',
  'task-tracking',
  'sub-agents',
  'web',
  'research',
  'scholar',
  'shell-command',
  'github',
])

function isSkillNativeTool(tool: {
  source?: string
  tags?: readonly string[]
}): boolean {
  if (tool.source === 'mcp') return false
  const tags = tool.tags ?? []
  if (tags.length === 0) return true
  return !tags.some((tag) => KNOWN_TOOLSET_CATEGORY_TAGS.has(tag.toLowerCase()))
}

/**
 * Sets prepareStep.activeTools to the skill's default tier when plan mode is
 * not actively restricting tools. Intersects with plan-mode allowlist via
 * {@link mergePrepareStepSlices}.
 */
export const activeToolsTierInjector: AgentInjector = {
  id: 'active-tools-tier',
  order: INJECTOR_ORDER.LANGUAGE + 2,
  applies({ profile }) {
    return profile.stage === 'toolLoop' || profile.stage === 'todoExecution'
  },
  onPrepareStep(runCtx, step) {
    const conversationId = runCtx.ctx.opts.conversationId
    if (isPlanModeActive(conversationId)) {
      return undefined
    }

    const skillId = runCtx.ctx.opts.skillId?.trim() || 'default'
    const catalogTools = runCtx.tools.map((tool) => ({
      name: tool.name,
      tags: 'tags' in tool ? (tool.tags as string[] | undefined) : undefined,
      source: tool.source === 'mcp' ? ('mcp' as const) : ('skill' as const),
    }))
    const skillNativeToolNames = catalogTools
      .filter(isSkillNativeTool)
      .map((tool) => tool.name)

    const activeTools = resolveDefaultActiveToolNames({
      skillId,
      allToolNames: step.allToolNames,
      catalogTools,
      skillNativeToolNames,
    })

    if (activeTools.length === 0) return undefined
    return { activeTools }
  },
}

;(activeToolsTierInjector as { bundleMarker?: string }).bundleMarker =
  ACTIVE_TOOLS_TIER_BUNDLE_MARKER

export {
  resolveDefaultActiveToolNames,
  defaultToolsetTagsForSkill,
  toolNamesMatchingTags,
  MANDATORY_TOOL_NAMES,
}
