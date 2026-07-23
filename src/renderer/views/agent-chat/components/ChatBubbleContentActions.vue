<template>
  <div
    v-if="hasContent"
    class="chat-bubble-actions"
    :class="{ 'chat-bubble-actions--corner': corner }"
  >
    <button
      v-if="showCopyPrint"
      type="button"
      class="chat-bubble-action-btn"
      :class="{ 'chat-bubble-action-btn--ok': copied }"
      :title="t.chat.copyBubbleContent"
      :aria-label="t.chat.copyBubbleContent"
      :disabled="copying"
      @click.stop="onCopy"
    >
      <UIcon
        :name="copied ? 'i-lucide-clipboard-check' : 'i-lucide-copy'"
        class="chat-bubble-action-btn__icon"
        aria-hidden="true"
      />
    </button>
    <button
      v-if="showCopyPrint"
      type="button"
      class="chat-bubble-action-btn"
      :title="t.chat.printBubbleContent"
      :aria-label="t.chat.printBubbleContent"
      :disabled="printing"
      @click.stop="onPrint"
    >
      <UIcon
        name="i-lucide-printer"
        class="chat-bubble-action-btn__icon"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      class="chat-bubble-action-btn"
      :title="t.chat.exportBubblePdf"
      :aria-label="t.chat.exportBubblePdf"
      :disabled="exporting"
      @click.stop="onExport"
    >
      <UIcon
        name="i-lucide-file-down"
        class="chat-bubble-action-btn__icon"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import type { BubblePdfDocumentKind } from '../bubblePdfExportHelpers'

const props = withDefaults(
  defineProps<{
    markdown?: string | null
    /** When set, copy/print/PDF skip markdown-it and use this literal text. */
    plainText?: string | null
    sectionTitle: string
    sectionId?: string
    messageId: string
    kind?: BubblePdfDocumentKind
    /** Pin to the top-right corner of a positioned parent bubble. */
    corner?: boolean
    /** Show copy and print actions (text response bubbles). */
    showCopyPrint?: boolean
  }>(),
  { corner: false, showCopyPrint: true },
)

const emit = defineEmits<{
  copied: []
  copyFailed: [message?: string]
  exported: [savedPath: string]
  failed: [message: string]
}>()

const { t } = useI18n()
const copying = ref(false)
const printing = ref(false)
const exporting = ref(false)
const copied = ref(false)
let copiedResetTimer: ReturnType<typeof setTimeout> | undefined

const hasContent = computed(
  () => Boolean(props.plainText?.trim() || props.markdown?.trim()),
)

async function onCopy(): Promise<void> {
  if (copying.value) return
  const plain = props.plainText?.trim()
  const markdown = props.markdown?.trim()
  if (!plain && !markdown) return

  copying.value = true
  try {
    const actions = await import('../bubbleContentActions')
    const ok = plain
      ? await actions.copyBubblePlainTextContent(plain)
      : await actions.copyBubbleMarkdownContent(markdown!)
    if (!ok) {
      emit('copyFailed')
      return
    }
    copied.value = true
    if (copiedResetTimer) clearTimeout(copiedResetTimer)
    copiedResetTimer = setTimeout(() => {
      copied.value = false
    }, 1600)
    emit('copied')
  } catch (error) {
    emit(
      'copyFailed',
      error instanceof Error ? error.message : String(error),
    )
  } finally {
    copying.value = false
  }
}

async function onPrint(): Promise<void> {
  if (printing.value) return
  const plain = props.plainText?.trim()
  const markdown = props.markdown?.trim()
  if (!plain && !markdown) return

  printing.value = true
  try {
    const actions = await import('../bubbleContentActions')
    if (plain) {
      await actions.printBubblePlainTextContent({
        text: plain,
        title: props.sectionTitle,
      })
    } else {
      await actions.printBubbleMarkdownContent({
        markdown: markdown!,
        title: props.sectionTitle,
      })
    }
  } finally {
    printing.value = false
  }
}

async function onExport(): Promise<void> {
  if (exporting.value) return
  const plain = props.plainText?.trim()
  const markdown = props.markdown?.trim()
  if (!plain && !markdown) return

  exporting.value = true
  try {
    const helpers = await import('../bubblePdfExportHelpers')
    const defaultFileName = helpers.bubblePdfDefaultFileName(
      props.sectionTitle,
      props.messageId,
    )
    const kind =
      props.kind ??
      helpers.bubblePdfKindForSection(props.sectionId?.trim() || 'generic')
    const result = plain
      ? await helpers.exportBubblePlainTextAsPdf({
          text: plain,
          defaultFileName,
          kind,
        })
      : await helpers.exportBubbleMarkdownAsPdf({
          markdown: markdown!,
          defaultFileName,
          kind,
        })
    if (result.savedPath) {
      emit('exported', result.savedPath)
      return
    }
    if (result.error && !result.error.includes('cancel')) {
      emit('failed', result.error)
    }
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.chat-bubble-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.chat-bubble-actions--corner {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
}

.chat-bubble-action-btn {
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

.chat-bubble-action-btn:hover:not(:disabled) {
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

.chat-bubble-action-btn--ok {
  color: var(--color-success-600, #16a34a);
  border-color: var(--color-success-400, #4ade80);
}

.chat-bubble-action-btn:focus-visible {
  outline: 2px solid var(--color-primary-500, #6366f1);
  outline-offset: 2px;
}

.chat-bubble-action-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

.chat-bubble-action-btn__icon {
  width: 14px;
  height: 14px;
}
</style>
