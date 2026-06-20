<template>
  <details
    v-if="props.html || props.outputLinks.length"
    class="step-disclosure"
    :class="{ 'step-disclosure--active': props.active }"
    :open="detailsOpen"
  >
    <summary class="step-disclosure__header">
      <span class="step-disclosure__toggle">
        <span class="step-disclosure__icon" aria-hidden="true" />
        <span class="step-disclosure__title">{{ props.title }}</span>
      </span>
    </summary>
    <div
      class="msg-html step-disclosure__content step-progress__stream"
      :class="{ 'step-progress__stream--active': props.active }"
      role="log"
      aria-live="polite"
      :aria-label="`${props.title} output`"
    >
      <div v-if="props.html" v-html="props.html" />
      <ChatStepOutputLinks
        v-if="props.outputLinks.length"
        :links="props.outputLinks"
        @open="emit('open-preview', $event)"
      />
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import '@renderer/components/code/terminal-theme.css'
import '../step-disclosure.css'
import ChatStepOutputLinks from './ChatStepOutputLinks.vue'
import type { StepOutputLinkView } from '../stepOutputLinksRender'

const props = withDefaults(
  defineProps<{
    title: string
    html: string
    outputLinks: readonly StepOutputLinkView[]
    active: boolean
    accordionMode?: boolean
    open?: boolean
  }>(),
  {
    outputLinks: () => [],
    accordionMode: false,
    open: false,
  },
)

const emit = defineEmits<{
  'open-preview': [url: string]
}>()

const detailsOpen = computed(() => {
  if (props.accordionMode) return props.open === true
  return props.active ? true : undefined
})
</script>

<style scoped>
@import '../step-disclosure.css';

.step-progress__stream {
  color: var(--ui-text);
  font-size: 14px;
  line-height: 1.5;
}
.step-progress__stream :deep(p) {
  margin: 0.35em 0;
}
.step-progress__stream :deep(pre) {
  margin: 0.5em 0;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--term-border);
  background: var(--term-code-bg);
  color: var(--ui-text);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--app-font-family);
  font-size: 12px;
  line-height: 1.45;
}
.step-progress__stream :deep(pre code) {
  font-family: inherit;
  color: inherit;
  background: transparent;
}
.step-progress__stream :deep(.task-badge) {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  line-height: 1.6;
  vertical-align: middle;
  font-family: var(--app-font-family);
}
.step-progress__stream :deep(.task-badge--pending) {
  background: var(--ui-bg-accented);
  color: var(--ui-text-muted);
}
.step-progress__stream :deep(.task-badge--running) {
  background: color-mix(in srgb, var(--color-primary-500, #6366f1) 15%, transparent);
  color: var(--color-primary-500, #6366f1);
}
.step-progress__stream :deep(.task-badge--done) {
  background: color-mix(in srgb, var(--color-success-500, #22c55e) 15%, transparent);
  color: var(--color-success-500, #22c55e);
}
.step-progress__stream :deep(.task-badge--failed) {
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 15%, transparent);
  color: var(--color-error-500, #ef4444);
}
.step-progress__stream :deep(.task-badge--warn) {
  background: color-mix(in srgb, var(--color-warning-500, #f59e0b) 15%, transparent);
  color: var(--color-warning-500, #f59e0b);
}
.step-progress__stream :deep(.task-badge--retry) {
  background: color-mix(in srgb, var(--color-primary-500, #6366f1) 15%, transparent);
  color: var(--color-primary-500, #6366f1);
}
.step-progress__stream :deep(.task-badge--task) {
  background: var(--ui-bg-accented);
  color: var(--ui-text-muted);
}
.step-progress__stream :deep(.task-badge--goal) {
  background: color-mix(in srgb, var(--color-primary-500, #6366f1) 12%, transparent);
  color: var(--color-primary-500, #6366f1);
}
</style>
