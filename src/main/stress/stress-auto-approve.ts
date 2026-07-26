/** Process-wide flag: while a stress run is active, skip HITL tool approvals. */

let autoApprove = false
let activeRunId: string | null = null

export function setStressAutoApproveToolCalls(
  enabled: boolean,
  runId?: string | null,
): void {
  autoApprove = enabled
  activeRunId = enabled ? (runId?.trim() || activeRunId) : null
}

export function isStressAutoApproveToolCalls(): boolean {
  return autoApprove
}

export function getActiveStressRunId(): string | null {
  return activeRunId
}

export function applyStressAutoApproveToolCalls(
  toolSet: Record<string, { needsApproval?: unknown }>,
): void {
  if (!autoApprove) return
  for (const spec of Object.values(toolSet)) {
    spec.needsApproval = false
  }
}
