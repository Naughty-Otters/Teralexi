<template>
  <article class="term terminal-panel">
    <div
      class="term__head terminal-panel__head"
      :class="{ 'term__head--open': showCommand || showOutput }"
    >
      <UIcon
        name="i-lucide-terminal"
        class="term__icon terminal-panel__head-icon"
        aria-hidden="true"
      />
      <div class="term__head-main">
        <div class="term__title terminal-panel__head-title">
          <span
            class="term__tool terminal-panel__tool"
            :class="{ 'term__tool--shimmer': isRunning }"
          >{{ displayName }}</span>
          <span class="term__sep terminal-panel__muted" aria-hidden="true">·</span>
          <span
            class="term__status terminal-panel__muted"
            :class="`terminal-panel__status--${presentation.tone}`"
          >
            {{ presentation.label }}
          </span>
          <span
            v-if="exitLabel"
            class="term__exit terminal-panel__exit"
            :class="{ 'terminal-panel__exit--bad': exitIsError }"
          >
            {{ exitLabel }}
          </span>
          <span class="term__toggles">
            <button
              v-if="commandText"
              type="button"
              class="term__toggle"
              :class="{ 'term__toggle--active': showCommand }"
              :aria-expanded="showCommand"
              @click="showCommand = !showCommand"
            >
              Command
            </button>
            <button
              v-if="outputText"
              type="button"
              class="term__toggle"
              :class="{ 'term__toggle--active': showOutput }"
              :aria-expanded="showOutput"
              @click="showOutput = !showOutput"
            >
              Output
            </button>
          </span>
        </div>
        <div v-if="showCommand && commandText" class="term__inline-panel">
          <ShikiCodeBlock
            :code="commandText"
            :language="commandLanguage"
            variant="terminal-command"
            compact
          />
        </div>
        <div v-if="showOutput && outputText" class="term__inline-panel">
          <ShikiCodeBlock
            :code="outputText"
            :language="outputLanguage"
            variant="terminal-output"
            compact
          />
        </div>
      </div>
    </div>

    <div v-if="errorText" class="term__err terminal-panel__err" role="alert">
      <ShikiCodeBlock
        :code="errorText"
        language="text"
        variant="terminal-output"
        compact
      />
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import '@renderer/components/code/terminal-theme.css'
import {
  guessLanguageFromCode,
  languageForTerminalSlot,
} from '@renderer/lib/shiki/guess-language'
import {
  extractTerminalView,
  getToolPartErrorText,
  getToolPartState,
  isTerminalToolRunning,
  toolPartDisplayName,
  toolRunStatePresentation,
  truncateDisplay,
} from './chat/chatToolPartHelpers'

const ShikiCodeBlock = defineAsyncComponent(
  () => import('@renderer/components/code/ShikiCodeBlock.vue'),
)

const props = defineProps<{ part: unknown }>()

const displayName = computed(() => toolPartDisplayName(props.part))
const state = computed(() => getToolPartState(props.part))
const isRunning = computed(() => isTerminalToolRunning(props.part))
const presentation = computed(() => {
  if (isRunning.value) return { label: 'Running', tone: 'info' as const }
  return toolRunStatePresentation(state.value)
})

const view = computed(() => extractTerminalView(props.part))

const commandText = computed(() => truncateDisplay(view.value.command, 14_000))
const outputText = computed(() => truncateDisplay(view.value.output, 20_000))
const errorText = computed(() =>
  truncateDisplay(getToolPartErrorText(props.part), 8_000),
)

const exitLabel = computed(() => {
  const { exitCode, success } = view.value
  if (typeof exitCode === 'number') return `exit ${exitCode}`
  if (success === false) return 'failed'
  return ''
})
const exitIsError = computed(() => {
  const { exitCode, success } = view.value
  return (typeof exitCode === 'number' && exitCode !== 0) || success === false
})

const commandLanguage = computed(() =>
  guessLanguageFromCode(commandText.value, languageForTerminalSlot('command')),
)
const outputLanguage = computed(() =>
  guessLanguageFromCode(outputText.value, languageForTerminalSlot('output')),
)

const showCommand = ref(false)
const showOutput = ref(false)
</script>

<style scoped>
.term__head-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.term__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}

.term__toggles {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.term__toggle {
  margin: 0;
  padding: 1px 7px;
  border: 1px solid var(--term-border, var(--ui-border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--term-code-bg, var(--ui-bg)) 80%, transparent);
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.45;
  cursor: pointer;
  white-space: nowrap;
}

.term__toggle:hover {
  color: var(--ui-text);
  border-color: color-mix(in srgb, var(--color-primary-500, #6366f1) 35%, var(--ui-border));
}

.term__toggle--active {
  color: var(--color-primary-500, #6366f1);
  border-color: color-mix(in srgb, var(--color-primary-500, #6366f1) 45%, var(--ui-border));
}

.term__inline-panel :deep(.shiki-surface) {
  margin: 0;
  max-height: 200px;
}

.term__err :deep(.shiki-surface) {
  margin: 0;
  max-height: 160px;
}

@keyframes term-shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
.term__tool--shimmer {
  background: linear-gradient(
    90deg,
    var(--term-prompt) 25%,
    color-mix(in srgb, var(--term-prompt) 40%, var(--term-title)) 50%,
    var(--term-prompt) 75%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: term-shimmer 1.6s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .term__tool--shimmer {
    animation: none;
    -webkit-text-fill-color: var(--term-prompt);
    background: none;
  }
}
</style>
