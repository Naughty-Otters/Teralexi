<template>
  <DiffHighlightView
    :diff="diff"
    :file-path="filePath"
    :compact="compact"
    :max-lines="maxLines"
  />
</template>

<script setup lang="ts">
import DiffHighlightView from '@renderer/components/code/DiffHighlightView.vue'

withDefaults(
  defineProps<{
    diff: string
    filePath?: string
    compact?: boolean
    maxLines?: number
  }>(),
  { compact: false, maxLines: undefined },
)
</script>
