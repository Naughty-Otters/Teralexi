import {
  defaultToolsetTagsForSkill,
  skillUsesToolsetExpansion,
  toolNamesMatchingTags,
} from '@shared/agent/skill-workspace-tool-defaults'
import { MANDATORY_TOOL_NAMES } from '@shared/agent/mandatory-tools'

/**
 * Tools advertised to the model on a normal (non–plan-mode) turn.
 * Full tool map may still contain more names for execute; `activeTools` only
 * shrinks what the model can choose.
 *
 * Skills with an explicit `allowed_tools` catalog (coding, etc.) already
 * constrain {@link allToolNames} — advertise that full set. Tag expansion is
 * only for skills that auto-enable toolSet categories.
 */
export function resolveDefaultActiveToolNames(args: {
  skillId: string
  allToolNames: readonly string[]
  catalogTools: readonly {
    name: string
    tags?: readonly string[]
    source?: 'skill' | 'mcp'
  }[]
  /** Skill-owned action tool names (always advertised for that skill). */
  skillNativeToolNames?: readonly string[]
}): string[] {
  const allowed = new Set(args.allToolNames)

  // Explicit-allowlist skills: do not shrink to mandatory-only via empty tags.
  if (!skillUsesToolsetExpansion(args.skillId)) {
    return [...args.allToolNames]
  }

  const tagMatched = toolNamesMatchingTags(
    args.catalogTools,
    defaultToolsetTagsForSkill(args.skillId),
  )
  const mcpNames = args.catalogTools
    .filter((tool) => tool.source === 'mcp')
    .map((tool) => tool.name)
  const native = args.skillNativeToolNames ?? []
  const mandatory = [...MANDATORY_TOOL_NAMES]

  return [
    ...new Set([...tagMatched, ...mcpNames, ...native, ...mandatory]),
  ].filter((name) => allowed.has(name))
}
