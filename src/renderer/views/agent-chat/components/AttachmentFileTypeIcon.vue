<template>
  <UIcon
    :name="presentation.icon"
    class="attachment-file-type-icon"
    :class="fileTypePresentationClass(presentation.tone)"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  fileTypePresentationClass,
  resolveFileTypePresentation,
} from '@shared/file-type/file-type-presentation'

const props = defineProps<{
  path: string
}>()

const presentation = computed(() => resolveFileTypePresentation(props.path))
</script>

<style scoped>
@import '../attachment-file-type.css';
</style>
