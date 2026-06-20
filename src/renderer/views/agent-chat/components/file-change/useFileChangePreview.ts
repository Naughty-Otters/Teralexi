import type { FileChangePreview } from '@shared/file-change/types'
import { isFileChangeToolName } from '@shared/file-change/types'
import { ref, watch, type MaybeRefOrGetter, toValue } from 'vue'

export function useFileChangePreview(
  toolName: MaybeRefOrGetter<string>,
  input: MaybeRefOrGetter<unknown>,
) {
  const files = ref<FileChangePreview[]>([])
  const error = ref('')
  const loading = ref(false)

  watch(
    () => [toValue(toolName), toValue(input)] as const,
    async ([name, rawInput]) => {
      files.value = []
      error.value = ''
      if (!isFileChangeToolName(name)) return

      const inputRecord =
        rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)
          ? (rawInput as Record<string, unknown>)
          : null
      if (!inputRecord) return

      const channel = window.ipcRendererChannel?.PreviewFileChange
      if (!channel) {
        error.value = 'Preview is unavailable in this environment.'
        return
      }

      loading.value = true
      try {
        const result = await channel.invoke({ toolName: name, input: inputRecord })
        if (result.ok) {
          files.value = result.files
        } else {
          error.value = result.error
        }
      } catch (err) {
        error.value = String(err)
      } finally {
        loading.value = false
      }
    },
    { immediate: true, deep: true },
  )

  return { files, error, loading }
}
