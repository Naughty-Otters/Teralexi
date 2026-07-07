<template>
  <div
    class="chat-bubble-actions-lazy"
    :class="{ 'chat-bubble-actions-lazy--corner': corner }"
    @mouseenter="mountNow"
    @focusin="mountNow"
  >
    <ChatBubbleContentActions
      v-if="show"
      :markdown="markdown"
      :section-title="sectionTitle"
      :section-id="sectionId"
      :message-id="messageId"
      :kind="kind"
      :corner="false"
      :show-copy-print="showCopyPrint"
      @copied="emit('copied')"
      @copy-failed="emit('copyFailed', $event)"
      @exported="emit('exported', $event)"
      @failed="emit('failed', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue'
import type { BubblePdfDocumentKind } from '../bubblePdfExportHelpers'

const ChatBubbleContentActions = defineAsyncComponent(
  () => import('./ChatBubbleContentActions.vue'),
)

withDefaults(
  defineProps<{
    markdown?: string | null
    sectionTitle: string
    sectionId?: string
    messageId: string
    kind?: BubblePdfDocumentKind
    corner?: boolean
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

const show = ref(false)

function mountNow(): void {
  show.value = true
}

onMounted(() => {
  const schedule =
    typeof requestIdleCallback === 'function'
      ? requestIdleCallback
      : (callback: IdleRequestCallback) => window.setTimeout(callback, 1)
  schedule(() => {
    mountNow()
  })
})
</script>

<style scoped>
.chat-bubble-actions-lazy {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.chat-bubble-actions-lazy--corner {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
}
</style>
