<template>
  <div class="fcs">
    <p v-if="label" class="fcs__label">{{ label }}</p>
    <p v-if="error" class="fcs__error" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="fcs__loading" aria-live="polite">Loading preview…</p>
    <FileChangeCard
      v-for="file in files"
      :key="fileChangeCardKey(file)"
      :file="file"
      :compact="compact"
      :brief-lines="briefLines"
    />
    <p v-if="!loading && !error && files.length === 0" class="fcs__empty">
      No file changes to display.
    </p>
  </div>
</template>

<script setup lang="ts">
import type { FileChangePreview } from '@shared/file-change/types'
import { TOOL_LOOP_BRIEF_DIFF_LINES } from '../chat/toolLoopPanelItems'
import FileChangeCard from './FileChangeCard.vue'

withDefaults(
  defineProps<{
    files: FileChangePreview[]
    label?: string
    error?: string
    loading?: boolean
    compact?: boolean
    /** Cap peek lines until expanded. Defaults to chat brief peek size. */
    briefLines?: number
  }>(),
  {
    label: '',
    error: '',
    loading: false,
    compact: false,
    briefLines: TOOL_LOOP_BRIEF_DIFF_LINES,
  },
)

function fileChangeCardKey(file: FileChangePreview): string {
  const moveFrom = file.moveFrom?.trim()
  return moveFrom ? `${file.path}\0${moveFrom}` : file.path
}
</script>

<style scoped>
.fcs {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  min-width: 0;
}
.fcs__label {
  margin: 0;
  padding: 8px 12px 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
}
.fcs__error {
  margin: 0;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-error-600, #dc2626);
}
.fcs__loading,
.fcs__empty {
  margin: 0;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
</style>
