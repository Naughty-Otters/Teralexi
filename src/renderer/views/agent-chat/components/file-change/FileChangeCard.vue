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
        @click="onToggleContentOpen"
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
    <div v-if="contentOpen" class="fc__body">
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
        @click="onToggleDiffExpanded"
      >
        <UIcon
          :name="diffExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          class="fc__expand-icon"
          aria-hidden="true"
        />
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FileChangeAction, FileChangePreview } from '@shared/file-change/types'
import { fileChangePreviewOpenUrl } from '@shared/agent/step-attachment'
import { useWorkspaceStore } from '@store/workspace'
import { requestSandboxPreview } from '../../sandboxPreviewBridge'
import { TOOL_LOOP_BRIEF_DIFF_LINES } from '../chat/toolLoopPanelItems'
import { diffNeedsBriefExpand } from './unifiedDiffLines'
import UnifiedDiffView from './UnifiedDiffView.vue'

const workspaceStore = useWorkspaceStore()

const props = withDefaults(
  defineProps<{
    file: FileChangePreview
    compact?: boolean
    /** Limit diff to this many lines until expanded. */
    briefLines?: number
  }>(),
  { compact: false, briefLines: TOOL_LOOP_BRIEF_DIFF_LINES },
)

/** Fully hide/show the file body (GitHub-style file fold). */
const contentOpen = ref(true)
/** Expand brief peek → full diff lines (separate from contentOpen). */
const diffExpanded = ref(false)

const briefLineLimit = computed(() => {
  const n = props.briefLines
  return n != null && n > 0 ? n : null
})

const isBrief = computed(
  () => briefLineLimit.value != null && !diffExpanded.value,
)

const maxDiffLines = computed(() =>
  diffExpanded.value ? undefined : (briefLineLimit.value ?? undefined),
)

const showDiff = computed(() => props.file.diff.trim().length > 0)

const canExpandDiff = computed(() => {
  const limit = briefLineLimit.value
  if (limit == null) return false
  if (!showDiff.value) return false
  return diffNeedsBriefExpand(props.file.diff, limit)
})

function onToggleDiffExpanded(event: MouseEvent) {
  diffExpanded.value = !diffExpanded.value
  const target = event.currentTarget
  if (target instanceof HTMLElement) target.blur()
}

function onToggleContentOpen() {
  contentOpen.value = !contentOpen.value
  // Folding the file resets the brief/full peek so reopen starts collapsed again.
  if (!contentOpen.value) diffExpanded.value = false
}
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
  border: 1px solid color-mix(in srgb, var(--ui-border) 75%, transparent);
  border-radius: 0;
  overflow: hidden;
  background: color-mix(in srgb, var(--ui-text) 1.5%, transparent);
}

.fc + .fc {
  margin-top: 0;
  border-top: none;
}

.fc__head {
  position: relative;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  min-height: 0;
  padding: 7px 10px 7px 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border) 70%, transparent);
  background: color-mix(in srgb, var(--ui-text) 3%, transparent);
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

.fc__fold:hover,
.fc__fold:focus-visible {
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

.fc__add { color: var(--diff-add); }
.fc__del { color: var(--diff-del); }

.fc :deep(.shiki-surface) {
  border: none;
  border-radius: 0;
  /* Line truncation is via briefLines; never CSS-cap (hides expand affordance). */
  max-height: none;
  padding: 0;
  margin: 0;
  background: var(--diff-surface-bg);
}

.fc--brief :deep(.shiki-diff__line) {
  padding-top: 0;
  padding-bottom: 0;
  min-height: 1.4em;
}

.fc__body {
  position: relative;
}

.fc__expand {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 28px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  color: var(--ui-text-muted);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--diff-surface-bg, var(--ui-bg)) 92%, transparent) 35%,
    transparent
  );
  transition: opacity 0.12s ease, color 0.12s ease;
}

/* Hover on the card (header or body) reveals the control; no layout reserved. */
.fc:hover .fc__expand,
.fc__expand:focus-visible {
  opacity: 1;
  pointer-events: auto;
}

/* Touch / no-hover pointers: keep a light always-on affordance. */
@media (hover: none) {
  .fc__expand {
    opacity: 0.85;
    pointer-events: auto;
  }
}

.fc__expand-icon {
  width: 16px;
  height: 16px;
}

.fc__expand:hover,
.fc__expand:focus-visible {
  color: var(--ui-text);
}
</style>
