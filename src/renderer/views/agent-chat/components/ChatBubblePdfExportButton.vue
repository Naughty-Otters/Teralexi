<template>
  <button
    v-if="hasContent"
    type="button"
    class="chat-bubble-pdf-btn"
    :class="{ 'chat-bubble-pdf-btn--corner': corner }"
    :title="t.chat.exportBubblePdf"
    :aria-label="t.chat.exportBubblePdf"
    :disabled="exporting"
    @click.stop="onExport"
  >
    <UIcon
      name="i-lucide-file-down"
      class="chat-bubble-pdf-btn__icon"
      aria-hidden="true"
    />
  </button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import {
  bubblePdfDefaultFileName,
  bubblePdfKindForSection,
  exportBubbleMarkdownAsPdf,
  type BubblePdfDocumentKind,
} from '../bubblePdfExport'

const props = withDefaults(
  defineProps<{
    markdown?: string | null
    sectionTitle: string
    sectionId?: string
    messageId: string
    kind?: BubblePdfDocumentKind
    /** Pin to the top-right corner of a positioned parent bubble. */
    corner?: boolean
  }>(),
  { corner: false },
)

const emit = defineEmits<{
  exported: [savedPath: string]
  failed: [message: string]
}>()

const { t } = useI18n()
const toast = useToast()
const exporting = ref(false)

const hasContent = computed(() => Boolean(props.markdown?.trim()))

async function onExport(): Promise<void> {
  const markdown = props.markdown?.trim()
  if (!markdown || exporting.value) return

  exporting.value = true
  try {
    const result = await exportBubbleMarkdownAsPdf({
      markdown,
      defaultFileName: bubblePdfDefaultFileName(
        props.sectionTitle,
        props.messageId,
      ),
      kind:
        props.kind ??
        bubblePdfKindForSection(props.sectionId?.trim() || 'generic'),
    })
    if (result.savedPath) {
      toast.add({
        title: t.value.chat.exportBubblePdfSuccess,
        color: 'success',
      })
      emit('exported', result.savedPath)
      return
    }
    if (result.error && !result.error.includes('cancel')) {
      toast.add({
        title: t.value.chat.exportBubblePdfFailed,
        description: result.error,
        color: 'error',
      })
      emit('failed', result.error)
    }
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.chat-bubble-pdf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-bg);
  color: var(--ui-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    color 0.15s ease,
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.chat-bubble-pdf-btn--corner {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
}

.chat-bubble-pdf-btn:hover:not(:disabled) {
  color: var(--color-primary-500, #6366f1);
  border-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 35%,
    var(--ui-border)
  );
  background: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 6%,
    var(--ui-bg)
  );
}

.chat-bubble-pdf-btn:focus-visible {
  outline: 2px solid var(--color-primary-500, #6366f1);
  outline-offset: 2px;
}

.chat-bubble-pdf-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

.chat-bubble-pdf-btn__icon {
  width: 14px;
  height: 14px;
}
</style>
