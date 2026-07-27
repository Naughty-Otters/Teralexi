<template>
  <DiffHighlightView
    :diff="diff"
    :file-path="filePath"
    :compact="compact"
    :fill="fill"
    :max-lines="maxLines"
  />
</template>

<script setup lang="ts">
/**
 * @deprecated Use DiffHighlightView. Kept as a thin alias for any leftover imports.
 */
import DiffHighlightView from './DiffHighlightView.vue'

withDefaults(
  defineProps<{
    diff: string
    filePath?: string
    compact?: boolean
    fill?: boolean
    maxLines?: number
  }>(),
  { compact: false, fill: false, maxLines: undefined },
)
</script>
