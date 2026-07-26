import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  LAYOUT_PREF_KEYS,
  writeStoredString,
} from '@renderer/lib/layout-preferences'
import { clearLayoutSnapshot, readLayoutSnapshot, writeLayoutSnapshot } from './persist'
import {
  assignConversationToLeaf,
  closeLeaf,
  countLeaves,
  createSingleLeafLayout,
  findLeaf,
  findLeafByConversation,
  firstLeafPaneId,
  listLeaves,
  pruneMissingConversations,
  setGroupRatio,
  splitLeaf,
  visibleConversationIds,
} from './tree'
import {
  MAX_CONVERSATION_PANES,
  type PaneNode,
  type SplitDirection,
} from './types'

const PERSIST_DEBOUNCE_MS = 80

/**
 * Binary-tree layout of conversation panes (VS Code-style splits).
 * Focused pane drives global chrome via agentStore.selectConversation.
 */
export const useConversationLayoutStore = defineStore(
  'conversation-layout',
  () => {
    const root = ref<PaneNode | null>(null)
    const focusedPaneId = ref<string | null>(null)
    const hydrated = ref(false)

    let persistTimer: ReturnType<typeof setTimeout> | null = null

    const leaves = computed(() =>
      root.value ? listLeaves(root.value) : [],
    )
    const leafCount = computed(() => leaves.value.length)
    const canSplit = computed(() => leafCount.value < MAX_CONVERSATION_PANES)
    const canCloseFocused = computed(() => leafCount.value > 1)
    const focusedConversationId = computed(() => {
      if (!root.value || !focusedPaneId.value) return null
      return findLeaf(root.value, focusedPaneId.value)?.conversationId ?? null
    })
    const visibleConversationIdList = computed(() =>
      root.value ? visibleConversationIds(root.value) : [],
    )

    function persistNow(): void {
      if (!root.value || !focusedPaneId.value) {
        clearLayoutSnapshot()
        return
      }
      writeLayoutSnapshot({
        version: 1,
        focusedPaneId: focusedPaneId.value,
        root: root.value,
      })
      const convId = focusedConversationId.value
      writeStoredString(LAYOUT_PREF_KEYS.lastConversationId, convId)
    }

    function schedulePersist(): void {
      if (persistTimer != null) clearTimeout(persistTimer)
      persistTimer = setTimeout(() => {
        persistTimer = null
        persistNow()
      }, PERSIST_DEBOUNCE_MS)
    }

    function ensureLayout(conversationId: string): void {
      const id = conversationId.trim()
      if (!id) return
      if (root.value && focusedPaneId.value) return
      const layout = createSingleLeafLayout(id)
      root.value = layout.root
      focusedPaneId.value = layout.focusedPaneId
      schedulePersist()
    }

    function focusPane(paneId: string): boolean {
      if (!root.value) return false
      const leaf = findLeaf(root.value, paneId)
      if (!leaf) return false
      focusedPaneId.value = paneId
      schedulePersist()
      return true
    }

    function focusPaneForConversation(conversationId: string): boolean {
      if (!root.value) return false
      const leaf = findLeafByConversation(root.value, conversationId)
      if (!leaf) return false
      focusedPaneId.value = leaf.paneId
      schedulePersist()
      return true
    }

    /**
     * Open a conversation in the focused pane, or focus the pane that already
     * shows it. Returns the focused pane id, or null on failure.
     */
    function openConversation(conversationId: string): string | null {
      const id = conversationId.trim()
      if (!id) return null

      if (!root.value || !focusedPaneId.value) {
        ensureLayout(id)
        return focusedPaneId.value
      }

      const existing = findLeafByConversation(root.value, id)
      if (existing) {
        focusedPaneId.value = existing.paneId
        schedulePersist()
        return existing.paneId
      }

      const next = assignConversationToLeaf(root.value, focusedPaneId.value, id)
      if (!next) return null
      root.value = next
      schedulePersist()
      return focusedPaneId.value
    }

    function splitFocused(
      direction: SplitDirection,
      newConversationId: string,
    ): string | null {
      if (!root.value || !focusedPaneId.value) return null
      const result = splitLeaf(
        root.value,
        focusedPaneId.value,
        newConversationId,
        direction,
      )
      if (!result) return null
      root.value = result.root
      focusedPaneId.value = result.newPaneId
      schedulePersist()
      return result.newPaneId
    }

    function closePane(paneId: string): string | null {
      if (!root.value) return null
      const result = closeLeaf(root.value, paneId)
      if (!result) return null
      root.value = result.root
      focusedPaneId.value = result.nextFocusedPaneId
      schedulePersist()
      return result.nextFocusedPaneId
    }

    function closeFocusedPane(): string | null {
      if (!focusedPaneId.value) return null
      return closePane(focusedPaneId.value)
    }

    /**
     * Remove any leaf showing this conversation. If it was the last leaf,
     * clears the layout (caller should seed a replacement).
     */
    function removeConversation(conversationId: string): {
      cleared: boolean
      nextFocusedConversationId: string | null
    } {
      if (!root.value) {
        return { cleared: true, nextFocusedConversationId: null }
      }
      const leaf = findLeafByConversation(root.value, conversationId)
      if (!leaf) {
        return {
          cleared: false,
          nextFocusedConversationId: focusedConversationId.value,
        }
      }
      if (countLeaves(root.value) <= 1) {
        root.value = null
        focusedPaneId.value = null
        schedulePersist()
        return { cleared: true, nextFocusedConversationId: null }
      }
      const nextFocusPaneId = closePane(leaf.paneId)
      const nextConv =
        nextFocusPaneId && root.value
          ? findLeaf(root.value, nextFocusPaneId)?.conversationId ?? null
          : null
      return { cleared: false, nextFocusedConversationId: nextConv }
    }

    function updateGroupRatio(groupPath: number[], ratio: number): void {
      if (!root.value) return
      const next = setGroupRatio(root.value, groupPath, ratio)
      if (!next) return
      root.value = next
      schedulePersist()
    }

    /**
     * Restore persisted layout after conversation lists are loaded.
     * Prunes leaves whose conversations no longer exist.
     */
    function hydrateFromStorage(
      existingConversationIds: ReadonlySet<string>,
      fallbackConversationId?: string | null,
    ): string | null {
      const snapshot = readLayoutSnapshot()
      if (snapshot) {
        const pruned = pruneMissingConversations(
          snapshot.root,
          existingConversationIds,
        )
        if (pruned) {
          root.value = pruned
          const focusStillValid = findLeaf(pruned, snapshot.focusedPaneId)
          focusedPaneId.value =
            focusStillValid?.paneId ?? firstLeafPaneId(pruned)
          hydrated.value = true
          persistNow()
          return focusedConversationId.value
        }
      }

      const fallback = fallbackConversationId?.trim()
      if (fallback && existingConversationIds.has(fallback)) {
        ensureLayout(fallback)
        hydrated.value = true
        persistNow()
        return fallback
      }

      root.value = null
      focusedPaneId.value = null
      hydrated.value = true
      clearLayoutSnapshot()
      return null
    }

    function resetForTests(): void {
      if (persistTimer != null) {
        clearTimeout(persistTimer)
        persistTimer = null
      }
      root.value = null
      focusedPaneId.value = null
      hydrated.value = false
      clearLayoutSnapshot()
    }

    return {
      root,
      focusedPaneId,
      hydrated,
      leaves,
      leafCount,
      canSplit,
      canCloseFocused,
      focusedConversationId,
      visibleConversationIdList,
      ensureLayout,
      focusPane,
      focusPaneForConversation,
      openConversation,
      splitFocused,
      closePane,
      closeFocusedPane,
      removeConversation,
      updateGroupRatio,
      hydrateFromStorage,
      persistNow,
      resetForTests,
      MAX_CONVERSATION_PANES,
    }
  },
)
