<template>
  <article
    class="fc"
    :class="{
      'fc--brief': isBrief && contentOpen,
      'fc--collapsed': !contentOpen,
    }"
  >
    <header class="fc__head">
      <button
        type="button"
        class="fc__fold"
        :aria-expanded="contentOpen"
        :aria-label="contentOpen ? 'Collapse file diff' : 'Expand file diff'"
        :title="contentOpen ? 'Collapse' : 'Expand'"
        @click="contentOpen = !contentOpen"
      >
        <UIcon
          :name="contentOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="fc__fold-icon"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="fc__path fc__path-btn"
        :title="
          previewUrl
            ? `Open ${relativePath} in preview panel`
            : `Preview unavailable for ${relativePath}`
        "
        :disabled="!previewUrl"
        @click="onOpenPath"
      >
        {{ relativePath }}
      </button>
      <span v-if="file.moveFrom && contentOpen" class="fc__rename">
        ← {{ relativeMoveFrom }}
      </span>
      <span v-if="actionLabel && contentOpen" class="fc__action">{{ actionLabel }}</span>
      <span class="fc__counts">
        <span v-if="file.additions > 0" class="fc__add">+{{ file.additions }}</span>
        <span v-if="file.deletions > 0" class="fc__del">−{{ file.deletions }}</span>
      </span>
    </header>
    <template v-if="contentOpen">
      <UnifiedDiffView
        v-if="showDiff"
        :diff="file.diff"
        :file-path="relativePath"
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
    </template>
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

/** Fully hide/show the file body (GitHub-style file fold). */
const contentOpen = ref(true)
/** Expand brief peek → full diff lines (separate from contentOpen). */
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

/** Prefer workspace-relative path (full relative path, not basename). */
function toWorkspaceRelative(raw: string | undefined): string {
  const path = (raw ?? '').trim()
  if (!path) return 'unknown'
  const normalized = path.replace(/\\/g, '/')
  const roots = [
    props.file.workspacePath,
    workspaceStore.activeWorkspacePath,
  ]
    .map((r) => (typeof r === 'string' ? r.trim().replace(/\\/g, '/').replace(/\/+$/, '') : ''))
    .filter(Boolean)

  for (const root of roots) {
    if (normalized === root) return '.'
    if (normalized.startsWith(`${root}/`)) {
      return normalized.slice(root.length + 1)
    }
  }
  // Already relative
  if (!normalized.startsWith('/') && !/^[A-Za-z]:/.test(normalized)) {
    return normalized
  }
  return normalized
}

const relativePath = computed(() => toWorkspaceRelative(props.file.path))
const relativeMoveFrom = computed(() => toWorkspaceRelative(props.file.moveFrom))

const previewUrl = computed(() =>
  fileChangePreviewOpenUrl(props.file, workspaceStore.activeWorkspacePath),
)

function onOpenPath() {
  const url = previewUrl.value
  if (!url) return
  requestSandboxPreview(url)
}
</script>

<style scoped>
.fc {
  border: 1px solid color-mix(in srgb, var(--ui-text) 22%, var(--ui-border));
  border-radius: 0;
  overflow: hidden;
  background: var(--ui-bg);
}

.fc + .fc {
  border-top-width: 0;
}

.fc__head {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  min-height: 0;
  padding: 6px 8px 6px 2px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-text) 18%, var(--ui-border));
  background: color-mix(in srgb, var(--ui-text) 8%, var(--ui-bg-elevated, var(--ui-bg)));
}

.fc--collapsed .fc__head {
  border-bottom: none;
}

.fc__fold {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text);
  opacity: 0.72;
  cursor: pointer;
}

.fc__fold:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--ui-text) 10%, transparent);
}

.fc__fold-icon {
  width: 14px;
  height: 14px;
}

.fc__path {
  min-width: 0;
  flex: 1;
  font-size: 12px;
  font-weight: 700;
  font-family: var(--app-font-family);
  word-break: break-all;
  color: var(--ui-text);
  line-height: 1.35;
  letter-spacing: 0.01em;
}

.fc__path-btn {
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
  text-decoration: none;
}

.fc__path-btn:disabled {
  cursor: default;
  opacity: 0.9;
}

.fc__path-btn:not(:disabled):hover {
  color: var(--color-primary-500, #6366f1);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.fc__rename {
  flex-shrink: 0;
  max-width: 28%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--ui-text-muted);
  font-family: var(--app-font-family);
}

.fc__action {
  flex-shrink: 0;
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
  margin-left: auto;
  font-size: 12px;
  font-family: var(--app-font-family);
  font-weight: 600;
}

.fc__add { color: var(--color-success-600, #16a34a); }
.fc__del { color: var(--color-error-600, #dc2626); }

.fc :deep(.shiki-surface) {
  border: none;
  border-radius: 0;
  max-height: 280px;
  padding: 0;
  margin: 0;
}

.fc--brief :deep(.shiki-surface) {
  max-height: none;
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
  border-top: 1px solid color-mix(in srgb, var(--ui-text) 16%, var(--ui-border));
  background: color-mix(in srgb, var(--ui-text) 5%, transparent);
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
