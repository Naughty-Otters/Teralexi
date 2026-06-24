import { computed, ref, type Ref } from 'vue'
import {
  CHAT_ATTACHMENT_MAX_FILES,
  formatChatAttachmentSize,
} from '@shared/chat/attachments'

export type StagedChatAttachment = {
  id: string
  sourcePath: string
  name: string
  sizeBytes?: number
}

export function useChatAttachments(options: {
  conversationId: Ref<string | null | undefined>
}) {
  const staged = ref<StagedChatAttachment[]>([])
  const picking = ref(false)
  const error = ref<string | null>(null)

  const canAddMore = computed(
    () => staged.value.length < CHAT_ATTACHMENT_MAX_FILES,
  )

  const attachmentSourcePaths = computed(() =>
    staged.value.map((item) => item.sourcePath),
  )

  function removeStaged(id: string) {
    staged.value = staged.value.filter((item) => item.id !== id)
  }

  function clearStaging() {
    staged.value = []
    error.value = null
  }

  async function pickAttachments() {
    if (!canAddMore.value) {
      error.value = `At most ${CHAT_ATTACHMENT_MAX_FILES} files per message.`
      return
    }
    picking.value = true
    error.value = null
    try {
      const ch = window.ipcRendererChannel?.PickChatAttachments
      if (!ch) {
        error.value = 'File attachments are not available.'
        return
      }
      const result = await ch.invoke()
      if (!result.ok) {
        error.value = result.error ?? 'Could not pick files.'
        return
      }
      addSourcePaths(result.paths ?? [])
    } finally {
      picking.value = false
    }
  }

  function addSourcePaths(paths: string[]) {
    if (paths.length === 0) return
    const remaining = CHAT_ATTACHMENT_MAX_FILES - staged.value.length
    const slice = paths.slice(0, remaining)
    const existing = new Set(staged.value.map((item) => item.sourcePath))
    for (const sourcePath of slice) {
      const trimmed = sourcePath.trim()
      if (!trimmed || existing.has(trimmed)) continue
      existing.add(trimmed)
      staged.value = [
        ...staged.value,
        {
          id: crypto.randomUUID(),
          sourcePath: trimmed,
          name: trimmed.split(/[/\\]/).pop() ?? trimmed,
        },
      ]
    }
    if (paths.length > remaining) {
      error.value = `Only ${CHAT_ATTACHMENT_MAX_FILES} files can be attached per message.`
    }
  }

  function formatStagedSize(item: StagedChatAttachment): string {
    if (typeof item.sizeBytes === 'number') {
      return formatChatAttachmentSize(item.sizeBytes)
    }
    return ''
  }

  return {
    staged,
    picking,
    error,
    canAddMore,
    attachmentSourcePaths,
    pickAttachments,
    addSourcePaths,
    removeStaged,
    clearStaging,
    formatStagedSize,
  }
}
