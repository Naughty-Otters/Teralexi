import { reactive } from 'vue'

/**
 * Worktree actions (merge/discard) clear the main-process record, but UI
 * lifecycle parts still carry the original branch. Track resolved run ids so
 * buttons do not come back after message re-renders.
 */
const resolvedByRunId = reactive<Record<string, true>>({})

const STORAGE_KEY = 'openfde:sub-agent-worktree-resolved'

function loadFromStorage(): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const ids = JSON.parse(raw) as unknown
    if (!Array.isArray(ids)) return
    for (const id of ids) {
      if (typeof id === 'string' && id.trim()) {
        resolvedByRunId[id.trim()] = true
      }
    }
  } catch {
    // ignore
  }
}

function persist(): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.keys(resolvedByRunId)),
    )
  } catch {
    // ignore
  }
}

loadFromStorage()

export function isSubAgentWorktreeResolved(runId: string): boolean {
  return resolvedByRunId[runId.trim()] === true
}

export function markSubAgentWorktreeResolved(runId: string): void {
  const id = runId.trim()
  if (!id || resolvedByRunId[id]) return
  resolvedByRunId[id] = true
  persist()
}

/** Reactive store for Vue computed tracking. */
export function subAgentWorktreeResolvedMap(): Readonly<Record<string, true>> {
  return resolvedByRunId
}

/**
 * Sync from main-process registry: if the run exists but no longer has a
 * worktree, treat actions as resolved.
 */
export async function syncSubAgentWorktreeResolvedFromIpc(
  runId: string,
): Promise<void> {
  const id = runId.trim()
  if (!id || resolvedByRunId[id]) return
  const ch = window.ipcRendererChannel?.ListSubAgentRuns
  if (!ch?.invoke) return
  try {
    const result = await ch.invoke({})
    if (!result?.ok || !Array.isArray(result.runs)) return
    const record = result.runs.find((r) => r.runId === id)
    // Known run with worktree cleared, or unknown after process restart with
    // no branch left — if we have a finished run without branch, hide actions.
    if (record && !record.worktreeBranch && !record.worktreePath) {
      markSubAgentWorktreeResolved(id)
    }
  } catch {
    // ignore
  }
}
