<template>
  <article
    class="etr"
    :class="{
      'etr--open': expanded,
      'etr--running': running,
    }"
  >
    <div class="etr__top" :class="{ 'etr__top--open': expanded }">
      <UIcon :name="toolIcon" class="etr__pin" aria-hidden="true" />
      <div class="etr__head">
        <div class="etr__title">
          <span
            class="etr__tool"
            :class="{ 'etr__tool--shimmer': running }"
          >{{ kindLabel }}</span>
          <span class="etr__toggles">
            <button
              type="button"
              class="etr__toggle"
              :class="{ 'etr__toggle--active': expanded }"
              :aria-expanded="expanded"
              :aria-label="expanded ? 'Hide details' : 'Show details'"
              :title="expanded ? 'Hide details' : 'Show details'"
              @click="expanded = !expanded"
            >
              <UIcon
                :name="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                class="etr__toggle-icon"
                aria-hidden="true"
              />
            </button>
          </span>
          <span v-if="brief" class="etr__sep" aria-hidden="true">·</span>
          <span v-if="brief" class="etr__brief" :title="brief">{{ brief }}</span>
          <span
            class="etr__status"
            :class="`etr__status--${presentation.tone}`"
          >
            {{ presentation.label }}
          </span>
        </div>

        <div v-if="expanded && paramsText" class="etr__inline-panel">
          <p class="etr__panel-label">{{ paramsLabel }}</p>
          <ShikiCodeBlock
            :code="paramsText"
            :language="paramsLanguage"
            variant="tool"
            compact
          />
        </div>

        <div v-if="expanded && outputText" class="etr__inline-panel">
          <p class="etr__panel-label">Output</p>
          <ShikiCodeBlock
            :code="outputText"
            :language="outputLanguage"
            variant="tool"
            compact
          />
        </div>

        <div v-if="expanded && errorText" class="etr__err" role="alert">
          <ShikiCodeBlock
            :code="errorText"
            language="text"
            variant="tool"
            compact
          />
        </div>

        <p
          v-if="expanded && running && !outputText && !errorText"
          class="etr__pending"
          aria-live="polite"
        >
          Working…
        </p>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { guessLanguageFromCode } from '@renderer/lib/shiki/guess-language'
import { shellExploreRowLabel } from '@shared/agent/explore-activity-summary'
import {
  formatToolHumanReadableAction,
} from '@shared/tool-result/tool-human-readable'
import { formatToolExploringDetails } from '@shared/tool-result/tool-exploring-display'
import {
  extractTerminalView,
  formatToolInput,
  formatToolOutput,
  getToolIcon,
  getToolPartErrorText,
  getToolPartInput,
  getToolPartState,
  isRunningState,
  isTerminalCommandToolName,
  isTerminalToolRunning,
  toolPartDisplayName,
  toolRunStatePresentation,
  truncateDisplay,
} from './chat/chatToolPartHelpers'

const ShikiCodeBlock = defineAsyncComponent(
  () => import('@renderer/components/code/ShikiCodeBlock.vue'),
)

const props = defineProps<{
  part: unknown
}>()

const expanded = ref(false)

const toolName = computed(() => toolPartDisplayName(props.part))
const input = computed(() => getToolPartInput(props.part))
const state = computed(() => getToolPartState(props.part))
const running = computed(() => {
  if (isTerminalCommandToolName(toolName.value)) {
    return isTerminalToolRunning(props.part)
  }
  return isRunningState(state.value)
})
const presentation = computed(() => {
  if (running.value) return { label: 'Running', tone: 'info' as const }
  return toolRunStatePresentation(state.value)
})
const toolIcon = computed(() => getToolIcon(toolName.value))

const kindLabel = computed(() => {
  const name = toolName.value
  if (name === 'read_file') return 'Read'
  if (name === 'lsp') return 'LSP'
  if (name === 'edit_files') return 'Edit'
  if (name === 'shell' || name === 'run_workspace_command') {
    const shell = shellExploreRowLabel(
      (input.value as { command?: unknown } | null)?.command ?? input.value,
    )
    return shell?.kind ?? 'Shell'
  }
  if (name === 'run_script' || name === 'run_script_file') return 'Script'
  if (name === 'web_search') return 'Search'
  if (name === 'web_scrape') return 'Scrape'
  return name
})

/** Cursor-style title fragment: path / pattern / short command — not a full sentence. */
const brief = computed(() => {
  const name = toolName.value
  const inp = input.value
  if (name === 'shell' || name === 'run_workspace_command') {
    const shell = shellExploreRowLabel(
      (inp as { command?: unknown } | null)?.command ?? inp,
    )
    if (shell?.detail) return shell.detail
  }

  const details = formatToolExploringDetails(name, inp)
  const preferred =
    details.find((field) =>
      ['File', 'Folder', 'Pattern', 'Search for', 'Link', 'Command', 'Script'].includes(
        field.label,
      ),
    ) ?? details[0]
  if (preferred?.value) return preferred.value

  const action = formatToolHumanReadableAction(name, inp).trim()
  // Drop leading verb when kind already names the action ("Read file …" → path).
  const stripped = action.replace(
    /^(Read|Write|Edit|Delete|Browse|Search|Find|Run|Move|Copy|Check|Apply)\s+(?:file|files|code|the web|an?|command)?\s*/i,
    '',
  )
  return (stripped || action).replace(/^["'`]|["'`]$/g, '')
})

const isTerminal = computed(() => isTerminalCommandToolName(toolName.value))

const terminalView = computed(() =>
  isTerminal.value ? extractTerminalView(props.part) : null,
)

const paramsLabel = computed(() =>
  isTerminal.value ? 'Command' : 'Parameters',
)

const paramsText = computed(() => {
  if (isTerminal.value) {
    return truncateDisplay(terminalView.value?.command ?? '', 14_000)
  }
  return truncateDisplay(formatToolInput(props.part), 14_000)
})

const outputText = computed(() => {
  if (isTerminal.value) {
    return truncateDisplay(terminalView.value?.output ?? '', 20_000)
  }
  return truncateDisplay(formatToolOutput(props.part), 20_000)
})

const errorText = computed(() =>
  truncateDisplay(getToolPartErrorText(props.part), 8_000),
)

const paramsLanguage = computed(() =>
  guessLanguageFromCode(
    paramsText.value,
    isTerminal.value ? 'bash' : 'json',
  ),
)
const outputLanguage = computed(() =>
  guessLanguageFromCode(outputText.value, 'text'),
)
</script>

<style scoped>
.etr {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
  max-width: 100%;
  font-size: 13px;
  line-height: 1.45;
  overflow: hidden;
}

.etr--running {
  border-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 28%,
    var(--ui-border)
  );
}

.etr__top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
}

.etr__top--open {
  padding-bottom: 8px;
}

.etr__pin {
  width: 15px;
  height: 15px;
  margin-top: 2px;
  flex-shrink: 0;
  opacity: 0.55;
  color: var(--ui-text-muted);
}

.etr__head {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.etr__title {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}

.etr__tool {
  font-family: var(--app-font-family);
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text);
  word-break: break-word;
}

@keyframes etr-shimmer {
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
}

.etr__tool--shimmer {
  background: linear-gradient(
    90deg,
    var(--ui-text) 25%,
    color-mix(in srgb, var(--color-primary-400, #818cf8) 90%, transparent) 50%,
    var(--ui-text) 75%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: etr-shimmer 1.6s linear infinite;
}

.etr__sep {
  color: var(--ui-text-muted);
  font-weight: 400;
  opacity: 0.6;
}

.etr__brief {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.etr__status {
  font-size: 12px;
  color: var(--ui-text-muted);
  flex-shrink: 0;
}

.etr__status--success {
  color: var(--color-success-600, #16a34a);
}
.etr__status--error {
  color: var(--color-error-600, #dc2626);
}
.etr__status--warn {
  color: var(--color-warning-600, #d97706);
}
.etr__status--info {
  color: var(--color-primary-500, #6366f1);
}

.etr__toggles {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.etr__toggle {
  margin: 0;
  padding: 2px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  line-height: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.etr__toggle:hover {
  color: var(--ui-text);
  background: color-mix(in srgb, var(--ui-text) 6%, transparent);
}

.etr__toggle--active {
  color: var(--color-primary-500, #6366f1);
}

.etr__toggle-icon {
  width: 14px;
  height: 14px;
}

.etr__panel-label {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.etr__inline-panel :deep(.shiki-surface) {
  margin: 0;
  max-height: 200px;
}

.etr__err {
  margin: 0;
  padding: 8px 0 0;
  border-top: 1px solid color-mix(in srgb, var(--color-error-500, #ef4444) 35%, var(--ui-border));
}

.etr__err :deep(.shiki-surface) {
  margin: 0;
}

.etr__pending {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted);
  font-style: italic;
}
</style>
