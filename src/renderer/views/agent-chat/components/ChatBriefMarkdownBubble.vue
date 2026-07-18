<template>
  <div class="brief-markdown-bubble">
    <ChatBubbleContentActionsLazy
      corner
      :markdown="markdown"
      section-title="Response"
      section-id="markdown"
      :message-id="message.id"
      @copied="onBubbleCopied"
      @copy-failed="onBubbleCopyFailed"
      @exported="onBubblePdfExported"
      @failed="onBubblePdfExportFailed"
    />
    <div class="msg-html brief-markdown-bubble__body" v-html="html" />
  </div>
</template>

<script setup lang="ts">
import type { UIMessage } from '@teralexi-ai'
import { computed } from 'vue'
import { assistantTextPartMarkdown } from '../bubblePdfExport'
import { useBubbleActionToasts } from '../composables/useBubbleActionToasts'
import ChatBubbleContentActionsLazy from './ChatBubbleContentActionsLazy.vue'

const props = defineProps<{
  message: UIMessage
  part: unknown
  html: string
}>()

const {
  onBubbleCopied,
  onBubbleCopyFailed,
  onBubblePdfExported,
  onBubblePdfExportFailed,
} = useBubbleActionToasts()

const markdown = computed(() =>
  assistantTextPartMarkdown(props.message, props.part),
)
</script>

<style scoped>
.brief-markdown-bubble {
  position: relative;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding-top: 4px;
  padding-right: 96px;
}

.brief-markdown-bubble__body {
  width: 100%;
}
</style>
