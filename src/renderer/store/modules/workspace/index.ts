import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  type WorkspaceEntry,
  conversationWorkspaceStack,
  workspaceActiveLabel,
  workspacePathFromStack,
} from '@shared/agent/workspace'
import { useAgentStore } from '@store/agent'

export const useWorkspaceStore = defineStore('workspace', () => {
  const conversationId = ref<string | null>(null)
  /** Folder chosen before a conversation exists; applied on the next new conversation. */
  const pendingWorkspacePath = ref<string | null>(null)
  const stack = ref<WorkspaceEntry[]>([{ type: 'sandbox' }])
  const lastError = ref<string | null>(null)

  const activeEntry = computed(
    () => stack.value[stack.value.length - 1] ?? { type: 'sandbox' as const },
  )

  const isWorkspaceActive = computed(() => activeEntry.value.type === 'workspace')

  const activeWorkspacePath = computed((): string | null =>
    workspacePathFromStack(stack.value),
  )

  const activeLabel = computed((): string =>
    workspaceActiveLabel(activeWorkspacePath.value),
  )

  const hasPendingWorkspace = computed(
    () => Boolean(pendingWorkspacePath.value?.trim()) && !conversationId.value,
  )

  function syncConversationListWorkspacePath(
    targetConversationId: string,
    path: string | null,
  ): void {
    useAgentStore().patchConversationWorkspacePath(targetConversationId, path)
  }

  function applyWorkspaceResult(result: {
    stack?: WorkspaceEntry[]
    workspacePath?: string | null
    error?: string
    ok?: boolean
  }): boolean {
    if (result.error || result.ok === false) {
      lastError.value = result.error ?? 'Failed to update workspace.'
      return false
    }
    lastError.value = null
    if (result.stack) stack.value = result.stack
    return true
  }

  function applyPendingStackToUi(): void {
    stack.value = conversationWorkspaceStack(pendingWorkspacePath.value)
  }

  async function loadForConversation(id: string | null | undefined): Promise<void> {
    const trimmed = id?.trim()
    conversationId.value = trimmed || null
    if (!trimmed) {
      applyPendingStackToUi()
      return
    }

    const ch = window.ipcRendererChannel?.GetConversationWorkspace
    if (!ch?.invoke) {
      stack.value = [{ type: 'sandbox' }]
      return
    }
    const result = await ch.invoke({ conversationId: trimmed })
    stack.value = result.stack
    lastError.value = null
  }

  async function commitPendingWorkspace(targetConversationId: string): Promise<void> {
    const path = pendingWorkspacePath.value?.trim()
    const conversation = targetConversationId?.trim()
    if (!path || !conversation) return

    pendingWorkspacePath.value = null

    const setCh = window.ipcRendererChannel?.SetConversationWorkspace
    if (!setCh?.invoke) {
      await loadForConversation(conversation)
      return
    }
    const result = await setCh.invoke({ conversationId: conversation, path })
    if (!applyWorkspaceResult(result)) {
      pendingWorkspacePath.value = path
      return
    }
    syncConversationListWorkspacePath(conversation, path)
    await loadForConversation(conversation)
  }

  async function selectAndSetWorkspace(): Promise<void> {
    const selectCh = window.ipcRendererChannel?.SelectWorkspaceFolder
    if (!selectCh?.invoke) return
    const { path } = await selectCh.invoke()
    if (!path) return

    const id = conversationId.value?.trim()
    if (!id) {
      pendingWorkspacePath.value = path
      applyPendingStackToUi()
      lastError.value = null
      return
    }

    const setCh = window.ipcRendererChannel?.SetConversationWorkspace
    if (!setCh?.invoke) return
    const result = await setCh.invoke({ conversationId: id, path })
    if (applyWorkspaceResult(result)) {
      syncConversationListWorkspacePath(id, path)
    }
  }

  async function clearWorkspace(): Promise<void> {
    const id = conversationId.value?.trim()
    if (!id) {
      pendingWorkspacePath.value = null
      stack.value = [{ type: 'sandbox' }]
      lastError.value = null
      return
    }

    const ch = window.ipcRendererChannel?.ClearConversationWorkspace
    if (!ch?.invoke) return
    const result = await ch.invoke({ conversationId: id })
    if (applyWorkspaceResult(result)) {
      syncConversationListWorkspacePath(id, null)
    }
  }

  async function setWorkspaceByPath(path: string): Promise<boolean> {
    const trimmed = path.trim()
    if (!trimmed) return false

    const id = conversationId.value?.trim()
    if (!id) {
      pendingWorkspacePath.value = trimmed
      applyPendingStackToUi()
      lastError.value = null
      return true
    }

    const setCh = window.ipcRendererChannel?.SetConversationWorkspace
    if (!setCh?.invoke) return false
    const result = await setCh.invoke({ conversationId: id, path: trimmed })
    if (!applyWorkspaceResult(result)) return false
    syncConversationListWorkspacePath(id, trimmed)
    await loadForConversation(id)
    return true
  }

  return {
    conversationId,
    pendingWorkspacePath,
    hasPendingWorkspace,
    stack,
    lastError,
    activeEntry,
    isWorkspaceActive,
    activeWorkspacePath,
    activeLabel,
    loadForConversation,
    commitPendingWorkspace,
    selectAndSetWorkspace,
    setWorkspaceByPath,
    clearWorkspace,
  }
})
