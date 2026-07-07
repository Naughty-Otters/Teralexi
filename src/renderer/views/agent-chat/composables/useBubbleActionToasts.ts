import { useI18n } from '@renderer/composables/useI18n'

export function useBubbleActionToasts() {
  const { t } = useI18n()
  const toast = useToast()

  function onBubbleCopied(): void {
    toast.add({
      title: t.value.chat.copyBubbleContentSuccess,
      color: 'success',
    })
  }

  function onBubbleCopyFailed(error?: string): void {
    toast.add({
      title: t.value.chat.copyBubbleContentFailed,
      description: error,
      color: 'error',
    })
  }

  function onBubblePdfExported(): void {
    toast.add({
      title: t.value.chat.exportBubblePdfSuccess,
      color: 'success',
    })
  }

  function onBubblePdfExportFailed(error: string): void {
    toast.add({
      title: t.value.chat.exportBubblePdfFailed,
      description: error,
      color: 'error',
    })
  }

  return {
    onBubbleCopied,
    onBubbleCopyFailed,
    onBubblePdfExported,
    onBubblePdfExportFailed,
  }
}
