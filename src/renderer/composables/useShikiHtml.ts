import {
  ref,
  watch,
  type MaybeRefOrGetter,
  toValue,
} from 'vue'
import { useAppIsDark } from '@renderer/composables/appColorMode'
import { codeToHtml } from '@renderer/lib/shiki/highlighter'
import { extractShikiInnerHtml } from '@renderer/lib/shiki/highlight-unified-diff'

export function useShikiHtml(
  source: MaybeRefOrGetter<string>,
  language: MaybeRefOrGetter<string | undefined>,
) {
  const isDark = useAppIsDark()
  const html = ref('')
  const loading = ref(false)
  let requestId = 0

  watch(
    [() => toValue(source), () => toValue(language), isDark],
    async () => {
      const id = ++requestId
      const code = toValue(source)
      if (!code) {
        html.value = ''
        loading.value = false
        return
      }

      loading.value = true
      try {
        const fragment = await codeToHtml(
          code,
          toValue(language),
          isDark.value,
        )
        if (id !== requestId) return
        html.value = extractShikiInnerHtml(fragment)
      } catch {
        if (id !== requestId) return
        html.value = ''
      } finally {
        if (id === requestId) loading.value = false
      }
    },
    { immediate: true },
  )

  return { html, loading, isDark }
}
