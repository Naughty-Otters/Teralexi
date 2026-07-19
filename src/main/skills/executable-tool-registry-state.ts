/** Shared mutable cache for {@link ./executable-tool-registry}. */

import { EXECUTABLE_TOOL_REGISTRY_BUNDLE_MARKER } from '@main/agent/harness-bundle-markers'

type CachedExecutable = {
  // SkillTool is structural; keep opaque here to avoid import cycles.
  tool: { name: string; execute: (input: Record<string, unknown>) => unknown }
  source: 'skill' | 'toolSet'
}

export const executableToolRegistryByKey = new Map<string, CachedExecutable>()

export function clearExecutableToolRegistry(): void {
  executableToolRegistryByKey.clear()
}

/** Packaging marker — must remain reachable in main-app.js. */
;(clearExecutableToolRegistry as { bundleMarker?: string }).bundleMarker =
  EXECUTABLE_TOOL_REGISTRY_BUNDLE_MARKER
