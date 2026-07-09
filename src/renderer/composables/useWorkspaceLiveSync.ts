import { onMounted, onUnmounted, watch } from 'vue'
import { useWorkspaceGitStore } from '@store/workspace-git'

/**
 * Refresh the file browser + git status panel when the workspace/sandbox changes.
 *
 * Refreshes are passive: the main process watches the workspace/sandbox directory
 * (`fs.watch`, debounced) and pushes `WorkspaceFilesChanged`; the renderer reacts
 * immediately to those notifications. We do not poll. Open editor tabs and the
 * active git diff view are left untouched (same as {@link refreshWorkspaceView}).
 *
 * Agent stream completion triggers a single reconciliation refresh as a safety net
 * in case the watcher missed the final write.
 *
 * `filesRootKey` should change when the browsed root switches between a workspace
 * folder and the conversation sandbox (or when the workspace path changes).
 */
export function useWorkspaceLiveSync(
  conversationId: () => string | null | undefined,
  filesRootKey: () => string | null | undefined,
) {
  const gitStore = useWorkspaceGitStore()
  let watchedConversationId: string | null = null

  function runPassiveRefresh() {
    void gitStore.refreshWorkspaceView({ silent: true })
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
    runPassiveRefresh()
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
    runPassiveRefresh()
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
