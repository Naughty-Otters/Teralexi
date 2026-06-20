<template>
  <ShikiDiffView
    :diff="diff"
    :file-path="filePath"
    :compact="compact"
    :max-lines="maxLines"
  />
</template>

<script setup lang="ts">
import ShikiDiffView from '@renderer/components/code/ShikiDiffView.vue'

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
