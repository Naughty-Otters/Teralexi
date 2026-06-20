<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  source: string
}>()

const emit = defineEmits<{
  error: [message: string | null]
}>()

const containerRef = ref<HTMLElement | null>(null)
const renderError = ref<string | null>(null)
let renderSeq = 0

async function renderDiagram() {
  const source = props.source.trim()
  if (!source) {
    renderError.value = null
    emit('error', null)
    if (containerRef.value) containerRef.value.innerHTML = ''
    return
  }

  const seq = ++renderSeq
  await nextTick()
  const el = containerRef.value
  if (!el) return

  try {
    const mermaid = (await import('mermaid')).default
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'strict',
    })
    await mermaid.parse(source)
    if (seq !== renderSeq) return

    const id = `wf-mermaid-${seq}`
    const { svg } = await mermaid.render(id, source)
    if (seq !== renderSeq) return

    el.innerHTML = svg
    renderError.value = null
    emit('error', null)
  } catch (err) {
    if (seq !== renderSeq) return
    const message = err instanceof Error ? err.message : String(err)
    renderError.value = message
    el.innerHTML = ''
    emit('error', message)
  }
}

watch(() => props.source, () => {
  void renderDiagram()
}, { immediate: true })

onBeforeUnmount(() => {
  renderSeq += 1
})
</script>

<template>
  <div class="wf-mermaid">
    <p v-if="renderError" class="wf-mermaid-error">{{ renderError }}</p>
    <div
      ref="containerRef"
      class="wf-mermaid-canvas"
      :class="{ 'wf-mermaid-canvas--error': renderError }"
    />
  </div>
</template>

<style scoped>
.wf-mermaid {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 16px;
  background: var(--ui-bg-muted);
}
.wf-mermaid-error {
  margin: 0 0 8px;
  color: var(--ui-error);
  font-size: 0.8125rem;
  white-space: pre-wrap;
}
.wf-mermaid-canvas {
  display: flex;
  justify-content: center;
}
.wf-mermaid-canvas :deep(svg) {
  max-width: 100%;
  height: auto;
}
.wf-mermaid-canvas--error {
  opacity: 0.5;
}
</style>
