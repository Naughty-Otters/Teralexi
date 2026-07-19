/** Shared mutable cache for {@link ./executable-tool-registry}. */

type CachedExecutable = {
  // SkillTool is structural; keep opaque here to avoid import cycles.
  tool: { name: string; execute: (input: Record<string, unknown>) => unknown }
  source: 'skill' | 'toolSet'
}

export const executableToolRegistryByKey = new Map<string, CachedExecutable>()

export function clearExecutableToolRegistry(): void {
  executableToolRegistryByKey.clear()
}
