<template>
  <div class="conversation-snapshot-preview">
    <div
      v-if="preview.loading"
      class="conversation-snapshot-preview__status"
      aria-live="polite"
    >
      Loading preview…
    </div>
    <p
      v-else-if="preview.error"
      class="conversation-snapshot-preview__status conversation-snapshot-preview__status--muted"
    >
      Preview unavailable
    </p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, watch } from 'vue'
import {
  fetchStepOutputLinkPreview,
  type StepOutputLinkPreviewState,
} from '../stepOutputLinkPreview'

const props = defineProps<{
  fileUrl: string
}>()

const preview = reactive<StepOutputLinkPreviewState>({ loading: true })

async function loadPreview(url: string) {
  const trimmed = url.trim()
  if (!trimmed) {
    Object.assign(preview, { loading: false, error: true })
    return
  }
  Object.assign(preview, { loading: true, dataUrl: undefined, error: false })
  const result = await fetchStepOutputLinkPreview(trimmed)
  Object.assign(preview, result)
}

onMounted(() => {
  void loadPreview(props.fileUrl)
})

watch(
  () => props.fileUrl,
  (url) => {
    void loadPreview(url)
  },
)
</script>

<style scoped>
.conversation-snapshot-preview {
  margin-top: 4px;
}

.conversation-snapshot-preview__image {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
}

.conversation-snapshot-preview__status {
  margin: 0;
  font-size: 13px;
  color: var(--ui-text-muted);
}

.conversation-snapshot-preview__status--muted {
  font-style: italic;
}
</style>
