<template>
  <section
    v-if="attachments.length > 0"
    class="conv-workspace-files"
    aria-label="Changed files"
  >
    <p class="conv-workspace-files__title">
      Files ({{ attachments.length }})
    </p>
    <ul class="conv-workspace-files__list">
      <li
        v-for="(item, index) in attachments"
        :key="`${item.path}-${index}`"
      >
        <button
          type="button"
          class="conv-workspace-files__item"
          :class="attachmentFileItemClass(item)"
          :disabled="!item.url"
          :title="itemTitle(item)"
          @click="onOpen(item)"
        >
          <AttachmentFileTypeIcon :path="attachmentFilePath(item)" />
          <span
            class="conv-workspace-files__path"
            :class="
              attachmentFilePathClass(attachmentFilePath(item), {
                deleted: item.action === 'delete',
              })
            "
          >{{ attachmentFilePath(item) }}</span>
          <span
            v-if="stepAttachmentHasDiffStats(item)"
            class="conv-workspace-files__stats"
          >
            <span v-if="(item.additions ?? 0) > 0" class="conv-workspace-files__add">
              +{{ item.additions }}
            </span>
            <span
              v-if="(item.deletions ?? 0) > 0"
              class="conv-workspace-files__del"
            >
              −{{ item.deletions }}
            </span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import {
  stepAttachmentHasDiffStats,
  type StepAttachment,
} from '@shared/agent/step-attachment'
import {
  attachmentFilePathClass,
  resolveFileTypePresentation,
} from '@shared/file-type/file-type-presentation'
import AttachmentFileTypeIcon from './AttachmentFileTypeIcon.vue'

defineProps<{
  attachments: StepAttachment[]
}>()

const emit = defineEmits<{
  'open-preview': [url: string]
}>()

function attachmentFilePath(item: StepAttachment): string {
  return item.displayPath || item.label || item.path
}

function attachmentFileItemClass(item: StepAttachment): string[] {
  const { tone } = resolveFileTypePresentation(attachmentFilePath(item))
  const classes = [`attachment-file-item--${tone}`]
  if (item.action === 'delete') classes.push('attachment-file-item--deleted')
  return classes
}

function itemTitle(item: StepAttachment): string {
  const path = attachmentFilePath(item)
  const { kindLabel } = resolveFileTypePresentation(path)
  if (item.action === 'delete') return `Deleted ${kindLabel.toLowerCase()}: ${path}`
  if (!item.url) return `${kindLabel}: ${path}`
  return `Open ${kindLabel.toLowerCase()} in preview panel: ${path}`
}

function onOpen(item: StepAttachment): void {
  const url = item.url?.trim()
  if (!url) return
  emit('open-preview', url)
}
</script>

<style scoped>
@import '../attachment-file-type.css';

.conv-workspace-files {
  flex-shrink: 0;
  margin: 0 16px 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  max-height: 120px;
  overflow-y: auto;
}

.conv-workspace-files__title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ui-text-muted);
}

.conv-workspace-files__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.conv-workspace-files__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 8px;
  padding-left: 6px;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-bg);
  font: inherit;
  font-size: 12px;
  color: var(--ui-text);
  text-align: left;
  cursor: pointer;
}

.conv-workspace-files__item:disabled {
  cursor: default;
  opacity: 0.85;
}

.conv-workspace-files__item:not(:disabled):hover {
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

.conv-workspace-files__item :deep(.attachment-file-type-icon) {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.conv-workspace-files__path {
  flex: 1;
  min-width: 0;
  font-family: var(--app-font-family);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-workspace-files__stats {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  flex-shrink: 0;
  font-family: var(--app-font-family);
  font-size: 11px;
  font-weight: 600;
}

.conv-workspace-files__add {
  color: var(--color-success-600, #16a34a);
}

.conv-workspace-files__del {
  color: var(--color-error-600, #dc2626);
}
</style>
