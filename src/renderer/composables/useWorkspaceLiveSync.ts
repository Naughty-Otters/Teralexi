import { onMounted, onUnmounted, watch } from 'vue'
import { useWorkspaceGitStore } from '@store/workspace-git'

// Refresh cadence: coalesce all change notifications into at most one refresh
// every 5 seconds. The refresh is driven passively by the main-process
// filesystem watcher, so bursts of edits collapse into a single 5s-throttled
// refresh of the file browser / git panel.
const DEBOUNCE_MS = 5000
// Safety valve so a long, continuous stream of changes still refreshes at least
// this often instead of being perpetually pushed back by the debounce.
const MAX_WAIT_MS = 5000

/**
 * Refresh the file browser + git panel when the workspace/sandbox changes.
 *
 * Refreshes are PASSIVE: the main process watches the workspace/sandbox
 * directory (`fs.watch`) and pushes `WorkspaceFilesChanged`; the renderer only
 * reacts to those notifications (debounced). We do not poll, and we do not
 * proactively re-read on every agent output event. Agent stream completion
 * triggers a single reconciliation refresh as a safety net in case the watcher
 * missed the final write.
 *
 * `filesRootKey` should change when the browsed root switches between a workspace
 * folder and the conversation sandbox (or when the workspace path changes).
 */
export function useWorkspaceLiveSync(
  conversationId: () => string | null | undefined,
  filesRootKey: () => string | null | undefined,
) {
  const gitStore = useWorkspaceGitStore()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let lastRefreshAt = 0
  let watchedConversationId: string | null = null

  function clearDebounce() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  function runRefresh() {
    debounceTimer = null
    lastRefreshAt = Date.now()
    void gitStore.refreshWorkspaceView()
  }

  function scheduleRefresh() {
    clearDebounce()
    const sinceLast = Date.now() - lastRefreshAt
    const wait = sinceLast >= MAX_WAIT_MS ? 0 : DEBOUNCE_MS
    debounceTimer = setTimeout(runRefresh, wait)
  }

  async function restartWatch() {
    const cid = conversationId()?.trim()
    if (!cid) return
    watchedConversationId = cid
    const ch = window.ipcRendererChannel?.WatchWorkspaceFiles
    if (!ch?.invoke) return
    await ch.invoke({ conversationId: cid })
  }

  /** Ensure the main-process watcher is attached, without forcing a refresh. */
  function ensureWatch() {
    const cid = conversationId()?.trim()
    if (!cid || watchedConversationId === cid) return
    void restartWatch()
  }

  function stopWatch() {
    const cid = watchedConversationId
    watchedConversationId = null
    if (!cid) return
    void window.ipcRendererChannel?.UnwatchWorkspaceFiles?.invoke?.({
      conversationId: cid,
    })
  }

  function onFilesChanged(
    _event: unknown,
    payload: { conversationId: string },
  ) {
    const cid = conversationId()?.trim()
    if (!cid || payload.conversationId !== cid) return
    scheduleRefresh()
  }

  function onAgentStreamFinished(
    _event: unknown,
    payload: { conversationId: string },
  ) {
    const cid = conversationId()?.trim()
    if (!cid || payload.conversationId !== cid) return
    // Single reconciliation at end of run: make sure the watcher is attached to
    // the (possibly newly created) sandbox and pull the final state once.
    void restartWatch()
    scheduleRefresh()
  }

  function onAgentSandboxOutput(
    _event: unknown,
    payload: { conversationId: string },
  ) {
    const cid = conversationId()?.trim()
    if (!cid || payload.conversationId !== cid) return
    // Passive: don't refresh on every output chunk. Just make sure the watcher
    // is attached; actual file changes are pushed by the main-process watcher.
    ensureWatch()
  }

  watch(
    [conversationId, filesRootKey],
    ([cid]) => {
      stopWatch()
      clearDebounce()
      const id = cid?.trim()
      if (id) void restartWatch()
    },
    { immediate: true },
  )

  onMounted(() => {
    window.ipcRendererChannel?.WorkspaceFilesChanged?.on?.(onFilesChanged)
    window.ipcRendererChannel?.AgentStreamFinished?.on?.(onAgentStreamFinished)
    window.ipcRendererChannel?.AgentSandboxOutput?.on?.(onAgentSandboxOutput)
  })

  onUnmounted(() => {
    clearDebounce()
    stopWatch()
    window.ipcRendererChannel?.WorkspaceFilesChanged?.removeListener?.(
      onFilesChanged,
    )
    window.ipcRendererChannel?.AgentStreamFinished?.removeListener?.(
      onAgentStreamFinished,
    )
    window.ipcRendererChannel?.AgentSandboxOutput?.removeListener?.(
      onAgentSandboxOutput,
    )
  })
}
