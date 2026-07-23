<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useImperativePlainPre } from './useImperativePlainPre'

const props = defineProps<{
  text: string
  bodyClass?: string
}>()

const hostEl = ref<HTMLElement | null>(null)

const plainPre = useImperativePlainPre({
  hostEl,
  className: props.bodyClass?.trim() || 'conversation-thinking-text',
})

watch(
  () => props.text,
  async (next) => {
    await nextTick()
    plainPre.setText(next)
  },
  { immediate: true, flush: 'post' },
)

watch(
  () => props.bodyClass,
  (cls) => {
    const pre = plainPre.getPre()
    if (pre) pre.className = cls?.trim() || 'conversation-thinking-text'
  },
)

defineExpose({
  /** Scroll container is the host root (overflow), not the imperative pre. */
  getScrollEl: () => hostEl.value,
})
</script>

<template>
  <!-- Host only — <pre> is imperative + textContent (not in Vue VNode tree). -->
  <div
    ref="hostEl"
    v-once
    class="conversation-thinking-plain-host"
  />
</template>

<style scoped>
.conversation-thinking-plain-host {
  display: block;
  width: 100%;
  min-width: 0;
}

.conversation-thinking-plain-host :deep(pre.conversation-thinking-text) {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0 10px 10px;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.45;
  font-family: var(--font-mono, ui-monospace, Menlo, monospace);
  color: var(--ui-text-muted);
  background: transparent;
  border: none;
}
</style>
