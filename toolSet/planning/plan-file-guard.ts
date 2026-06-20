import {
  isCanonicalPlanMarkdownPath,
  planModeStorageOptionsFromEnv,
  resolvePlanModeStorage,
} from '@main/agent/coding/plan-mode-storage-impl'
import { extractFileToolPaths } from '../file-system/permission-keys'
import { PLAN_FILE_WRITE_TOOLS } from './constants'

type PlanFileToolSpec = {
  needsApproval?: unknown
  execute?: (input: unknown) => Promise<unknown>
}

/** Restrict file writes in plan mode to the plans/ directory (plan markdown + todos). */
export function wrapPlanModeFileToolExecutes(
  toolSet: Record<string, PlanFileToolSpec>,
  conversationId: string | undefined,
): void {
  const id = conversationId?.trim()
  if (!id) return
  const storage = resolvePlanModeStorage(id, planModeStorageOptionsFromEnv(id))
  if (!storage) return

  for (const name of PLAN_FILE_WRITE_TOOLS) {
    const spec = toolSet[name]
    if (!spec?.execute) continue
    spec.needsApproval = false
    const orig = spec.execute.bind(spec)
    spec.execute = async (input: unknown) => {
      const paths = extractFileToolPaths(
        name,
        (input ?? {}) as Record<string, unknown>,
      )
      for (const p of paths) {
        if (!isCanonicalPlanMarkdownPath(storage, p)) {
          return {
            error: `Explore mode: only the active plan file (${storage.planFile.displayPath}) may be edited — use update_todos to sync steps.`,
          }
        }
      }
      return orig(input)
    }
  }
}
