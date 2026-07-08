import { onMounted, onUnmounted, watch } from 'vue'
import { useWorkspaceGitStore } from '@store/workspace-git'

const DEBOUNCE_MS = 350

/**
 * Watch workspace/sandbox files on disk and refresh the file browser + git when
 * they change (agent edits, external tools, manual refresh).
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
  let watchedConversationId: string | null = null

  function clearDebounce() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  function scheduleRefresh() {
    clearDebounce()
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void gitStore.refreshWorkspaceView()
    }, DEBOUNCE_MS)
  }

  async function restartWatch() {
    const cid = conversationId()?.trim()
    if (!cid) return
    watchedConversationId = cid
    const ch = window.ipcRendererChannel?.WatchWorkspaceFiles
    if (!ch?.invoke) return
    await ch.invoke({ conversationId: cid })
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
    void restartWatch()
    scheduleRefresh()
  }

  function onAgentSandboxOutput(
    _event: unknown,
    payload: { conversationId: string },
  ) {
    const cid = conversationId()?.trim()
    if (!cid || payload.conversationId !== cid) return
    void restartWatch()
    scheduleRefresh()
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
