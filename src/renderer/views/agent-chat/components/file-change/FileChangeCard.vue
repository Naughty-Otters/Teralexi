<template>
  <article class="fc" :class="{ 'fc--brief': isBrief }">
    <header class="fc__head" :class="{ 'fc__head--brief': isBrief }">
      <button
        type="button"
        class="fc__path fc__path-btn"
        :title="
          previewUrl
            ? `Open ${file.path} in preview panel`
            : `Preview unavailable for ${file.path}`
        "
        :disabled="!previewUrl"
        @click="onOpenPath"
      >
        {{ file.path }}
      </button>
      <span v-if="file.moveFrom && !isBrief" class="fc__rename">
        ← {{ file.moveFrom }}
      </span>
      <span v-if="actionLabel && !isBrief" class="fc__action">{{ actionLabel }}</span>
      <span class="fc__counts">
        <span v-if="file.additions > 0" class="fc__add">+{{ file.additions }}</span>
        <span v-if="file.deletions > 0" class="fc__del">−{{ file.deletions }}</span>
      </span>
    </header>
    <UnifiedDiffView
      v-if="showDiff"
      :diff="file.diff"
      :file-path="file.path"
      :compact="compact && !diffExpanded"
      :max-lines="diffExpanded ? undefined : maxDiffLines"
    />
    <button
      v-if="canExpandDiff"
      type="button"
      class="fc__expand"
      :aria-expanded="diffExpanded"
      :aria-label="diffExpanded ? 'Show less' : 'Show full diff'"
      :title="diffExpanded ? 'Show less' : 'Show full diff'"
      @click="diffExpanded = !diffExpanded"
    >
      <UIcon
        :name="diffExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="fc__expand-icon"
        aria-hidden="true"
      />
    </button>
  </article>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import type { FileChangeAction, FileChangePreview } from '@shared/file-change/types'
import { fileChangePreviewOpenUrl } from '@shared/agent/step-attachment'
import { useWorkspaceStore } from '@store/workspace'
import { requestSandboxPreview } from '../../sandboxPreviewBridge'
import { parseUnifiedDiffLines, countBriefDiffLines } from './unifiedDiffLines'

const UnifiedDiffView = defineAsyncComponent(
  () => import('./UnifiedDiffView.vue'),
)

const workspaceStore = useWorkspaceStore()

const props = withDefaults(
  defineProps<{
    file: FileChangePreview
    compact?: boolean
    /** Limit diff to this many lines until expanded. */
    briefLines?: number
  }>(),
  { compact: false, briefLines: undefined },
)

const diffExpanded = ref(false)

const isBrief = computed(
  () => props.briefLines != null && props.briefLines > 0 && !diffExpanded.value,
)

const maxDiffLines = computed(() =>
  diffExpanded.value ? undefined : props.briefLines,
)

const showDiff = computed(() => props.file.diff.trim().length > 0)

function countableBriefLines(diff: string): number {
  return countBriefDiffLines(parseUnifiedDiffLines(diff))
}

const canExpandDiff = computed(() => {
  if (props.briefLines == null || props.briefLines <= 0) return false
  if (!showDiff.value) return false
  return countableBriefLines(props.file.diff) > props.briefLines
})

const ACTION_LABELS: Record<FileChangeAction, string> = {
  create: 'New file',
  modify: 'Modified',
  delete: 'Deleted',
  rename: 'Renamed',
}

const actionLabel = computed(() => {
  const action = props.file.action
  return action ? ACTION_LABELS[action] : ''
})

const previewUrl = computed(() =>
  fileChangePreviewOpenUrl(props.file, workspaceStore.activeWorkspacePath),
)

function onOpenPath() {
  const url = previewUrl.value
  if (!url) return
  // Always open the chat report/preview panel (right), matching attachment
  // file rows — never route some extensions to the workspace editor.
  requestSandboxPreview(url)
}
</script>

<style scoped>
.fc {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--ui-bg);
}
.fc__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-text) 3%, transparent);
}
.fc__head--brief {
  flex-wrap: nowrap;
  gap: 8px;
  padding: 4px 8px;
}
.fc__path {
  min-width: 0;
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--app-font-family);
  word-break: break-word;
  color: var(--ui-text);
}
.fc__head--brief .fc__path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 500;
}
.fc__path-btn {
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--ui-text) 25%, transparent);
  text-underline-offset: 2px;
}
.fc__path-btn:disabled {
  cursor: default;
  text-decoration: none;
  opacity: 0.85;
}
.fc__path-btn:not(:disabled):hover {
  color: var(--color-primary-500, #6366f1);
  text-decoration-color: currentColor;
}
.fc__rename {
  font-size: 11px;
  color: var(--ui-text-muted);
  font-family: var(--app-font-family);
}
.fc__action {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--ui-text-muted);
  background: var(--ui-bg-accented);
}
.fc__counts {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  flex-shrink: 0;
  font-size: 11px;
  font-family: var(--app-font-family);
  font-weight: 600;
}
.fc__add { color: var(--color-success-600, #16a34a); }
.fc__del { color: var(--color-error-600, #dc2626); }
.fc :deep(.shiki-surface) {
  border: none;
  border-radius: 0;
  max-height: 280px;
  padding: 6px 8px;
}

.fc--brief :deep(.shiki-surface) {
  max-height: none;
  padding: 4px 8px;
}

.fc--brief :deep(.shiki-diff__line) {
  padding-top: 0;
  padding-bottom: 0;
  min-height: 1.35em;
}

.fc__expand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin: 0;
  padding: 4px 10px;
  border: none;
  border-top: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-text) 3%, transparent);
  color: var(--ui-text-muted);
  cursor: pointer;
}

.fc__expand-icon {
  width: 16px;
  height: 16px;
}

.fc__expand:hover {
  color: var(--ui-text);
  background: color-mix(in srgb, var(--ui-text) 6%, transparent);
}
</style>
