import { defineStore } from 'pinia'
import { ref } from 'vue'

export type WorkspacePanelTab = 'files' | 'git'

/**
 * Cross-panel navigation: open workspace split panel and highlight a path from chat diffs.
 */
export const useWorkspaceNavigationStore = defineStore('workspace-navigation', () => {
  const openSplitPanel = ref(false)
  const tab = ref<WorkspacePanelTab>('files')
  const highlightPath = ref<string | null>(null)

  function openInWorkspace(filePath: string, opts?: { tab?: WorkspacePanelTab }) {
    highlightPath.value = filePath.replace(/\\/g, '/')
    tab.value = opts?.tab ?? 'files'
    openSplitPanel.value = true
  }

  function clearHighlight() {
    highlightPath.value = null
  }

  function consumeOpenSplitPanelRequest(): boolean {
    if (!openSplitPanel.value) return false
    openSplitPanel.value = false
    return true
  }

  return {
    openSplitPanel,
    tab,
    highlightPath,
    openInWorkspace,
    clearHighlight,
    consumeOpenSplitPanelRequest,
  }
})
