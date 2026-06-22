<template>
  <div class="brief-markdown-bubble">
    <div class="brief-markdown-bubble__toolbar">
      <ChatBubblePdfExportButton
        :markdown="markdown"
        section-title="Response"
        section-id="markdown"
        :message-id="message.id"
      />
    </div>
    <div class="msg-html brief-markdown-bubble__body" v-html="html" />
  </div>
</template>

<script setup lang="ts">
import type { UIMessage } from '@openfde-ai'
import { computed } from 'vue'
import { assistantTextPartMarkdown } from '../bubblePdfExport'
import ChatBubblePdfExportButton from './ChatBubblePdfExportButton.vue'

const props = defineProps<{
  message: UIMessage
  part: unknown
  html: string
}>()

const markdown = computed(() =>
  assistantTextPartMarkdown(props.message, props.part),
)
</script>

<style scoped>
.brief-markdown-bubble {
  position: relative;
  min-width: var(--chat-response-bubble-min-width, 50%);
}

.brief-markdown-bubble__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 4px;
}

.brief-markdown-bubble__body {
  width: 100%;
}
</style>
