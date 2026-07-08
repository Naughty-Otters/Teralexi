import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  LAYOUT_PREF_KEYS,
  readStoredBoolean,
  readStoredBooleanMap,
  readStoredString,
  readStoredStringMap,
  writeStoredBoolean,
  writeStoredBooleanMap,
  writeStoredStringMap,
} from '@renderer/lib/layout-preferences'

export type WorkspacePanelTab = 'files' | 'git'

function migrateLegacyWorkspacePanelOpen(
  map: Record<string, boolean>,
): Record<string, boolean> {
  if (Object.keys(map).length > 0) return map
  const legacyOpen = readStoredBoolean(
    LAYOUT_PREF_KEYS.workspaceSplitPanelOpen,
    false,
  )
  if (!legacyOpen) return map
  const lastConversationId = readStoredString(LAYOUT_PREF_KEYS.lastConversationId)
  if (!lastConversationId) return map
  writeStoredBoolean(LAYOUT_PREF_KEYS.workspaceSplitPanelOpen, false)
  return { ...map, [lastConversationId]: true }
}

function loadWorkspacePanelOpenMap(): Record<string, boolean> {
  const map = readStoredBooleanMap(
    LAYOUT_PREF_KEYS.workspacePanelOpenByConversation,
  )
  const migrated = migrateLegacyWorkspacePanelOpen(map)
  if (migrated !== map) {
    writeStoredBooleanMap(
      LAYOUT_PREF_KEYS.workspacePanelOpenByConversation,
      migrated,
    )
  }
  return migrated
}

/**
 * Cross-panel navigation and per-conversation workspace split-panel layout state.
 */
export const useWorkspaceNavigationStore = defineStore(
  'workspace-navigation',
  () => {
    const openSplitPanel = ref(false)
    const tab = ref<WorkspacePanelTab>('files')
    const highlightPath = ref<string | null>(null)
    const workspacePanelOpenByConversation = ref<Record<string, boolean>>(
      loadWorkspacePanelOpenMap(),
    )
    const workspacePanelTabByConversation = ref<Record<string, string>>(
      readStoredStringMap(LAYOUT_PREF_KEYS.workspacePanelTabByConversation),
    )

    function isWorkspacePanelOpen(
      conversationId: string | null | undefined,
    ): boolean {
      const id = conversationId?.trim()
      if (!id) return false
      return workspacePanelOpenByConversation.value[id] === true
    }

    function setWorkspacePanelOpen(
      conversationId: string,
      open: boolean,
    ): void {
      const id = conversationId.trim()
      if (!id) return
      const next = { ...workspacePanelOpenByConversation.value }
      if (open) {
        next[id] = true
      } else {
        delete next[id]
      }
      workspacePanelOpenByConversation.value = next
      writeStoredBooleanMap(
        LAYOUT_PREF_KEYS.workspacePanelOpenByConversation,
        next,
      )
    }

    function toggleWorkspacePanelOpen(
      conversationId: string | null | undefined,
    ): void {
      const id = conversationId?.trim()
      if (!id) return
      setWorkspacePanelOpen(id, !isWorkspacePanelOpen(id))
    }

    function getWorkspacePanelTab(
      conversationId: string | null | undefined,
    ): WorkspacePanelTab {
      const id = conversationId?.trim()
      if (!id) return 'files'
      const stored = workspacePanelTabByConversation.value[id]
      return stored === 'git' ? 'git' : 'files'
    }

    function setWorkspacePanelTab(
      conversationId: string,
      nextTab: WorkspacePanelTab,
    ): void {
      const id = conversationId.trim()
      if (!id) return
      const next = { ...workspacePanelTabByConversation.value, [id]: nextTab }
      workspacePanelTabByConversation.value = next
      writeStoredStringMap(
        LAYOUT_PREF_KEYS.workspacePanelTabByConversation,
        next,
      )
    }

    function openInWorkspace(
      filePath: string,
      opts?: { tab?: WorkspacePanelTab; conversationId?: string },
    ) {
      highlightPath.value = filePath.replace(/\\/g, '/')
      const nextTab = opts?.tab ?? 'files'
      tab.value = nextTab
      const conversationId = opts?.conversationId?.trim()
      if (conversationId) {
        setWorkspacePanelTab(conversationId, nextTab)
        setWorkspacePanelOpen(conversationId, true)
      }
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

    function copyLayoutToConversation(
      sourceConversationId: string,
      targetConversationId: string,
    ): void {
      const sourceId = sourceConversationId.trim()
      const targetId = targetConversationId.trim()
      if (!sourceId || !targetId || sourceId === targetId) return
      setWorkspacePanelOpen(targetId, isWorkspacePanelOpen(sourceId))
      setWorkspacePanelTab(targetId, getWorkspacePanelTab(sourceId))
    }

    return {
      openSplitPanel,
      tab,
      highlightPath,
      workspacePanelOpenByConversation,
      workspacePanelTabByConversation,
      isWorkspacePanelOpen,
      setWorkspacePanelOpen,
      toggleWorkspacePanelOpen,
      getWorkspacePanelTab,
      setWorkspacePanelTab,
      openInWorkspace,
      clearHighlight,
      consumeOpenSplitPanelRequest,
      copyLayoutToConversation,
    }
  },
)
