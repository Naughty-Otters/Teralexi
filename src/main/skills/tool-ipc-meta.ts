import type { SkillTool } from './types'

/**
 * IPC and UI catalogs cannot send function `needsApproval` handlers (structured clone).
 * Runtime tool execution keeps the original handler on the SkillTool instance.
 */
export function serializeNeedsApproval(
  needsApproval:
    | SkillTool['needsApproval']
    | ((input: unknown) => boolean | Promise<boolean>),
): boolean {
  if (typeof needsApproval === 'function') return true
  return needsApproval ?? false
}
