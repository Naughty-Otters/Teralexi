<template>
  <div>
    <div v-if="submittedForm" class="user-form-submitted" role="status">
      <div class="user-form-submitted-header">
        <UIcon
          name="i-lucide-clipboard-check"
          class="user-form-submit-icon"
          aria-hidden="true"
        />
        <span>{{ formChip ?? 'Form submitted' }}</span>
      </div>
      <dl v-if="submittedForm.fields.length > 0" class="user-form-submitted-fields">
        <div
          v-for="field in submittedForm.fields"
          :key="field.key"
          class="user-form-submitted-row"
        >
          <dt>{{ field.label }}</dt>
          <dd>{{ field.value || '—' }}</dd>
        </div>
      </dl>
    </div>
    <ul v-if="attachments.length > 0" class="user-attachment-list">
      <li v-for="item in attachments" :key="item.id">
        <button
          type="button"
          class="user-attachment-chip"
          :title="revealTitle(item)"
          @click="onReveal(item)"
        >
          <AttachmentFileTypeIcon :path="item.originalName" />
          <span class="user-attachment-name">{{ item.originalName }}</span>
          <span class="user-attachment-size">{{
            formatChatAttachmentSize(item.sizeBytes)
          }}</span>
        </button>
      </li>
    </ul>
    <div
      v-if="plainText"
      class="msg-plain md-preview"
      v-html="renderedHtml"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, type Ref } from 'vue'
import type { UIMessage } from '@teralexi-ai'
import { renderMarkdownHtml, rendererMarkdown } from '@renderer/lib/markdown'
import {
  userCollectFormResponseChipLabel,
  userMessagePlainText,
  userSubmittedFormView,
} from './chat/chatUserMessageHelpers'
import {
  formatChatAttachmentSize,
  type ChatAttachmentMeta,
} from '@shared/chat/attachments'
import AttachmentFileTypeIcon from './AttachmentFileTypeIcon.vue'
import { CHAT_MESSAGE_ATTACHMENTS_KEY } from './chatAttachmentContext'
import './chat/markdown-preview.css'

const props = defineProps<{ message: UIMessage }>()

const messageAttachmentsById = inject<Ref<Record<string, ChatAttachmentMeta[]>>>(
  CHAT_MESSAGE_ATTACHMENTS_KEY,
)
const conversationId = inject<Ref<string | null | undefined>>('chatConversationId')

const submittedForm = computed(() => userSubmittedFormView(props.message))
const formChip = computed(() => userCollectFormResponseChipLabel(props.message))
const plainText = computed(() => userMessagePlainText(props.message))
const renderedHtml = computed(() => {
  void rendererMarkdown.value
  return renderMarkdownHtml(plainText.value)
})
const attachments = computed(
  () => messageAttachmentsById?.value?.[props.message.id] ?? [],
)

function revealTitle(item: ChatAttachmentMeta): string {
  return `Reveal ${item.originalName} in file manager`
}

async function onReveal(item: ChatAttachmentMeta) {
  const cid = conversationId?.value?.trim()
  if (!cid) return
  const ch = window.ipcRendererChannel?.RevealChatAttachment
  if (!ch) return
  await ch.invoke({ conversationId: cid, sandboxPath: item.sandboxPath })
}
</script>

<style scoped>
.user-form-submitted {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-primary) 8%, transparent);
  max-width: min(100%, 420px);
}
.user-form-submitted-header {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}
.user-form-submit-icon {
  flex-shrink: 0;
  opacity: 0.85;
}
.user-form-submitted-fields {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.user-form-submitted-row {
  display: grid;
  grid-template-columns: minmax(7rem, 34%) 1fr;
  gap: 8px 12px;
  align-items: start;
}
.user-form-submitted-row dt {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}
.user-form-submitted-row dd {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}
.user-attachment-list {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.user-attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-text) 4%, var(--ui-bg-elevated));
  color: var(--ui-text);
  font-size: 12px;
  cursor: pointer;
}
.user-attachment-chip:hover {
  border-color: color-mix(in srgb, var(--color-primary-500) 35%, var(--ui-border));
}
.user-attachment-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}
.user-attachment-size {
  color: var(--ui-text-muted);
  flex-shrink: 0;
}
</style>
