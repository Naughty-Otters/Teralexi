<template>
  <article class="fc">
    <header class="fc__head">
      <UIcon name="i-lucide-file-diff" class="fc__icon" aria-hidden="true" />
      <div class="fc__meta">
        <button
          type="button"
          class="fc__path fc__path-btn"
          :title="`Open ${file.path} in workspace panel`"
          @click="onOpenPath"
        >
          {{ file.path }}
        </button>
        <span v-if="file.moveFrom" class="fc__rename">
          ← {{ file.moveFrom }}
        </span>
      </div>
      <span v-if="actionLabel" class="fc__action">{{ actionLabel }}</span>
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
      @click="diffExpanded = !diffExpanded"
    >
      {{ diffExpanded ? 'Show less' : 'Show full diff' }}
    </button>
  </article>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import type { FileChangeAction, FileChangePreview } from '@shared/file-change/types'
import { useWorkspaceNavigationStore } from '@store/workspace-navigation'
import { useWorkspaceStore } from '@store/workspace'

const UnifiedDiffView = defineAsyncComponent(
  () => import('./UnifiedDiffView.vue'),
)

const navStore = useWorkspaceNavigationStore()
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

const maxDiffLines = computed(() =>
  diffExpanded.value ? undefined : props.briefLines,
)

const showDiff = computed(() => props.file.diff.trim().length > 0)

const canExpandDiff = computed(() => {
  if (props.briefLines == null || props.briefLines <= 0) return false
  if (!showDiff.value) return false
  const lineCount = props.file.diff.split('\n').length
  return lineCount > props.briefLines
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

function onOpenPath() {
  const target = props.file.path?.trim()
  if (!target) return
  navStore.openInWorkspace(target, {
    tab: 'files',
    conversationId: workspaceStore.conversationId ?? undefined,
  })
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
.fc__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.65;
  color: var(--ui-text-muted);
}
.fc__meta {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.fc__path {
  font-size: 12px;
  font-weight: 600;
  font-family: var(--app-font-family);
  word-break: break-word;
  color: var(--ui-text);
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
.fc__path-btn:hover {
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
}

.fc__expand {
  display: block;
  width: 100%;
  margin: 0;
  padding: 5px 10px;
  border: none;
  border-top: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-text) 3%, transparent);
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
}

.fc__expand:hover {
  color: var(--ui-text);
  background: color-mix(in srgb, var(--ui-text) 6%, transparent);
}
</style>
