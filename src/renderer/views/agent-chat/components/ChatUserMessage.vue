<template>
  <div>
    <div v-if="formChip" class="user-form-submit-chip">
      <UIcon name="i-lucide-clipboard-check" class="user-form-submit-icon" />
      <span>{{ formChip }}</span>
    </div>
    <div
      v-if="plainText"
      class="msg-plain md-preview"
      v-html="renderedHtml"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UIMessage } from '@openfde-ai'
import { renderMarkdownHtml } from '@renderer/lib/markdown'
import {
  userCollectFormResponseChipLabel,
  userMessagePlainText,
} from './chat/chatUserMessageHelpers'
import './chat/markdown-preview.css'

const props = defineProps<{ message: UIMessage }>()

const formChip = computed(() => userCollectFormResponseChipLabel(props.message))
const plainText = computed(() => userMessagePlainText(props.message))
const renderedHtml = computed(() => renderMarkdownHtml(plainText.value))
</script>

<style scoped>
.user-form-submit-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-primary) 8%, transparent);
  font-size: 13px;
  font-weight: 600;
}
.user-form-submit-icon {
  flex-shrink: 0;
  opacity: 0.85;
}
</style>
