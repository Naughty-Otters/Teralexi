<template>
  <pre
    class="shiki-surface"
    :class="surfaceClass"
  ><code v-if="html" v-html="html" /><code v-else>{{ code }}</code></pre>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useShikiHtml } from '@renderer/composables/useShikiHtml'
import './shiki-shared.css'

const props = withDefaults(
  defineProps<{
    code: string
    language?: string
    variant?: 'default' | 'terminal' | 'terminal-command' | 'terminal-output' | 'tool'
    compact?: boolean
  }>(),
  {
    language: 'text',
    variant: 'default',
    compact: false,
  },
)

const { html } = useShikiHtml(toRef(props, 'code'), () => props.language)

const surfaceClass = computed(() => ({
  'shiki-surface--compact': props.compact,
  'shiki-surface--terminal':
    props.variant === 'terminal' || props.variant === 'terminal-command',
  'shiki-surface--terminal-command': props.variant === 'terminal-command',
  'shiki-surface--terminal-output': props.variant === 'terminal-output',
  'shiki-surface--tool': props.variant === 'tool',
}))
</script>

<style scoped>
.shiki-surface--tool {
  max-height: 200px;
  background: color-mix(in srgb, var(--ui-text) 5%, transparent);
}
</style>
