import { RUN_SCRIPT_TOOLS } from '@shared/constants'
import {
  isMandatoryTool,
  withMandatoryToolsInCatalog,
} from '@shared/agent/mandatory-tools'

export const RUN_SCRIPT_LEGACY_TOOL = RUN_SCRIPT_TOOLS.LEGACY

export function isSplitRunScriptTool(toolName: string): boolean {
  switch (toolName) {
    case RUN_SCRIPT_TOOLS.CONTENT:
    case RUN_SCRIPT_TOOLS.FILE:
      return true
    default:
      return false
  }
}

export function hasToolEnabledWithLegacySupport(
  selectedNames: Set<string>,
  toolName: string,
): boolean {
  return (
    selectedNames.has(toolName) ||
    (selectedNames.has(RUN_SCRIPT_LEGACY_TOOL) &&
      isSplitRunScriptTool(toolName))
  )
}

/** Propagate legacy `run_script` approval flag to split tool names. */
export function expandRunScriptApprovalOverrides(
  overrides: Record<string, boolean>,
): Record<string, boolean> {
  const next = { ...overrides }
  const legacy = overrides[RUN_SCRIPT_LEGACY_TOOL]
  if (typeof legacy === 'boolean') {
    next.run_script ??= legacy
    next.run_script_file ??= legacy
  }
  return next
}

export function filterToolsByAvailableSet<T extends { name: string }>(
  tools: T[],
  options: {
    availableSetTouched: boolean
    selectedNames: Set<string>
  },
): string[] {
  if (!options.availableSetTouched) {
    return tools.map((tool) => tool.name)
  }
  return tools
    .filter(
      (tool) =>
        isMandatoryTool(tool.name) ||
        hasToolEnabledWithLegacySupport(options.selectedNames, tool.name),
    )
    .map((tool) => tool.name)
}

/** UI/runtime: when AvailableSet was never customized, every catalog tool is enabled. */
export function isToolEnabledInAvailableSet(
  toolName: string,
  options: {
    availableSetTouched: boolean
    availableSet: readonly string[]
  },
): boolean {
  if (isMandatoryTool(toolName)) return true
  if (!options.availableSetTouched) return true
  return hasToolEnabledWithLegacySupport(
    new Set(options.availableSet),
    toolName,
  )
}

/**
 * Reconcile persisted AvailableSet with the current toolSet catalog.
 * When untouched, all catalog tools are enabled. When touched, only saved names
 * that still exist in the catalog remain enabled (new tools start disabled).
 */
export function reconcileAvailableSetWithCatalog<T extends { name: string }>(
  catalogTools: readonly T[],
  options: {
    availableSetTouched: boolean
    savedAvailableSet?: readonly string[]
  },
): string[] {
  if (!options.availableSetTouched) {
    return catalogTools.map((tool) => tool.name)
  }
  const catalogNames = new Set(catalogTools.map((tool) => tool.name))
  const saved = (options.savedAvailableSet ?? []).filter((name) =>
    catalogNames.has(name),
  )
  return withMandatoryToolsInCatalog(
    catalogTools,
    filterToolsByAvailableSet(catalogTools, {
      availableSetTouched: true,
      selectedNames: new Set(saved),
    }),
  )
}

function defaultEnabledNamesWithSkillActions<T extends { name: string }>(
  catalogTools: readonly T[],
  validAllowed: readonly string[],
  skillActionToolNames?: readonly string[],
): Set<string> {
  const catalogNames = new Set(catalogTools.map((tool) => tool.name))
  const selected = new Set(validAllowed)
  for (const name of skillActionToolNames ?? []) {
    const trimmed = name.trim()
    if (trimmed && catalogNames.has(trimmed)) {
      selected.add(trimmed)
    }
  }
  for (const name of catalogTools.map((tool) => tool.name)) {
    if (isMandatoryTool(name)) selected.add(name)
  }
  return selected
}

/**
 * Resolve AvailableSet for a skill-backed agent.
 * User customization wins. Otherwise skill `allowedTools` restricts defaults.
 * Tools from the skill `actions/` folder are always included in that default set.
 * When neither applies, all catalog tools are enabled (untouched).
 */
export function resolveSkillAvailableSet<T extends { name: string }>(
  catalogTools: readonly T[],
  options: {
    skillAllowedTools?: readonly string[]
    /** Names from `skills/<id>/actions/` — enabled by default with `allowed_tools`. */
    skillActionToolNames?: readonly string[]
    savedAvailableSet?: readonly string[]
    availableSetTouched?: boolean
  },
): { availableSet: string[]; availableSetTouched: boolean } {
  if (options.availableSetTouched) {
    return {
      availableSet: withMandatoryToolsInCatalog(
        catalogTools,
        reconcileAvailableSetWithCatalog(catalogTools, {
          availableSetTouched: true,
          savedAvailableSet: options.savedAvailableSet,
        }),
      ),
      availableSetTouched: true,
    }
  }

  const skillAllowed = (options.skillAllowedTools ?? [])
    .map((name) => name.trim().replace(/^`|`$/g, ''))
    .filter(Boolean)

  if (skillAllowed.length > 0) {
    const catalogNames = new Set(catalogTools.map((tool) => tool.name))
    const validAllowed = skillAllowed.filter((name) => catalogNames.has(name))
    const fullCatalog = catalogTools.map((tool) => tool.name)
    const saved = options.savedAvailableSet ?? []
    const savedIsFullCatalog =
      saved.length > 0 &&
      saved.length === fullCatalog.length &&
      fullCatalog.every((name) => saved.includes(name))

    if (savedIsFullCatalog) {
      return {
        availableSet: fullCatalog,
        availableSetTouched: false,
      }
    }

    return {
      availableSet: filterToolsByAvailableSet(catalogTools, {
        availableSetTouched: true,
        selectedNames: defaultEnabledNamesWithSkillActions(
          catalogTools,
          validAllowed,
          options.skillActionToolNames,
        ),
      }),
      availableSetTouched: true,
    }
  }

  return {
    availableSet: reconcileAvailableSetWithCatalog(catalogTools, {
      availableSetTouched: false,
      savedAvailableSet: options.savedAvailableSet,
    }),
    availableSetTouched: false,
  }
}
