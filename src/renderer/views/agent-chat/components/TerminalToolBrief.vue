<template>
  <div v-if="hasContent" class="terminal-brief">
    <p v-if="commandLine" class="terminal-brief__cmd" :title="view.command">
      {{ commandLine }}
    </p>
    <ShikiCodeBlock
      v-if="outputBlock"
      :code="outputBlock"
      :language="outputLanguage"
      variant="terminal-output"
      compact
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ShikiCodeBlock from '@renderer/components/code/ShikiCodeBlock.vue'
import {
  guessLanguageFromCode,
  languageForTerminalSlot,
} from '@renderer/lib/shiki/guess-language'
import { TOOL_LOOP_BRIEF_DIFF_LINES } from './chat/toolLoopPanelItems'
import {
  extractTerminalView,
  truncateDisplay,
} from './chat/chatToolPartHelpers'

const props = withDefaults(
  defineProps<{
    part: unknown
    maxLines?: number
    maxCommandChars?: number
  }>(),
  {
    maxLines: TOOL_LOOP_BRIEF_DIFF_LINES,
    maxCommandChars: 120,
  },
)

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[mGKHF]/g, '')
}

function briefTextLines(text: string, maxLines: number): string {
  const lines = stripAnsi(text).split('\n')
  if (lines.length <= maxLines) return lines.join('\n')
  return `${lines.slice(0, maxLines).join('\n')}\n…`
}

const view = computed(() => extractTerminalView(props.part))

const commandLine = computed(() => {
  const cmd = view.value.command.trim()
  if (!cmd) return ''
  return truncateDisplay(cmd, props.maxCommandChars)
})

const outputBlock = computed(() => {
  const out = stripAnsi(view.value.output).trim()
  if (!out) return ''
  return briefTextLines(out, props.maxLines)
})

const hasContent = computed(
  () => commandLine.value.length > 0 || outputBlock.value.length > 0,
)

const outputLanguage = computed(() =>
  guessLanguageFromCode(
    view.value.output,
    languageForTerminalSlot('output'),
  ),
)
</script>

<style scoped>
.terminal-brief {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.terminal-brief__cmd {
  margin: 0;
  font-family: var(--app-font-family);
  font-size: 11px;
  color: var(--ui-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.terminal-brief :deep(.shiki-surface) {
  max-height: calc(1.5em * 5);
}
</style>
