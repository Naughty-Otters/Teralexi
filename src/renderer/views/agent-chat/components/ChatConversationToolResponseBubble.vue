<template>
  <article
    class="conv-tool-response"
    :class="[
      `conv-tool-response--${viewer}`,
      { 'conv-tool-response--compact': !expanded },
    ]"
  >
    <header class="conv-tool-response__header">
      <button
        type="button"
        class="conv-tool-response__toggle"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <UIcon
          :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="conv-tool-response__chevron"
          aria-hidden="true"
        />
        <UIcon :name="presentation.icon" class="conv-tool-response__icon" aria-hidden="true" />
        <span class="conv-tool-response__title">
          <span class="conv-tool-response__tool">{{ toolName }}</span>
          <span class="conv-tool-response__sep" aria-hidden="true">·</span>
          <span class="conv-tool-response__badge">{{ presentation.label }}</span>
          <span class="conv-tool-response__sep" aria-hidden="true">·</span>
          <span
            class="conv-tool-response__status"
            :class="`conv-tool-response__status--${statusTone}`"
          >
            {{ statusLabel }}
          </span>
          <span
            v-if="!expanded && compactHint"
            class="conv-tool-response__hint"
            :title="compactHint"
          >
            {{ compactHint }}
          </span>
        </span>
      </button>
    </header>

    <div v-show="expanded" class="conv-tool-response__body-wrap">
      <ChatTodoChecklist
        v-if="viewer === 'todo' && todoItems"
        class="conv-tool-response__body"
        :todos="todoItems"
      />

      <div
        v-else-if="viewer === 'diff' && fileChanges.length"
        class="conv-tool-response__body"
      >
        <FileChangeStack :files="fileChanges" compact />
      </div>

      <div v-else-if="viewer === 'patch'" class="conv-tool-response__body">
        <p v-if="patchPreview.path" class="conv-tool-response__path">
          {{ patchPreview.path }}
        </p>
        <ShikiCodeBlock
          :code="truncatedPatch"
          language="diff"
          variant="tool"
          compact
        />
      </div>

      <div v-else-if="viewer === 'file'" class="conv-tool-response__body">
        <p v-if="filePreview.path" class="conv-tool-response__path">
          {{ filePreview.path }}
        </p>
        <ShikiCodeBlock
          :code="truncatedFileContent"
          :language="fileLanguage"
          variant="tool"
          compact
        />
      </div>

      <div
        v-else-if="viewer === 'terminal'"
        class="conv-tool-response__body conv-tool-response__body--terminal"
      >
        <details v-if="terminalView.command" class="conv-tool-response__slot">
          <summary>Command</summary>
          <ShikiCodeBlock
            :code="truncatedCommand"
            :language="commandLanguage"
            variant="terminal-command"
            compact
          />
        </details>
        <details v-if="terminalOutput" class="conv-tool-response__slot">
          <summary>Output</summary>
          <ShikiCodeBlock
            :code="terminalOutput"
            :language="outputLanguage"
            variant="terminal-output"
            compact
          />
        </details>
      </div>

      <div v-else class="conv-tool-response__body">
        <ShikiCodeBlock
          :code="truncatedGenericOutput"
          :language="genericLanguage"
          variant="tool"
          compact
        />
      </div>

      <div v-if="errorText" class="conv-tool-response__error" role="alert">
        <ShikiCodeBlock :code="errorText" language="text" variant="tool" compact />
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import ShikiCodeBlock from '@renderer/components/code/ShikiCodeBlock.vue'
import {
  guessLanguageFromCode,
  languageForTerminalSlot,
} from '@renderer/lib/shiki/guess-language'
import { parseToolFileChanges } from '@shared/file-change/parse-tool-file-changes'
import FileChangeStack from './file-change/FileChangeStack.vue'
import ChatTodoChecklist from './ChatTodoChecklist.vue'
import type { ConversationToolResponseViewer } from './chat/conversationToolResponseModel'
import {
  extractFilePreview,
  extractPatchPreview,
  viewerPresentation,
} from './chat/conversationToolResponseModel'
import {
  extractTerminalView,
  formatToolOutput,
  getToolPartErrorText,
  getToolPartOutput,
  getToolPartState,
  parseTodoToolPart,
  toolPartDisplayName,
  toolRunStatePresentation,
  truncateDisplay,
} from './chat/chatToolPartHelpers'

const props = defineProps<{
  part: unknown
  viewer: ConversationToolResponseViewer
}>()

const expanded = ref(false)
const maxLen = 20_000
const compactHintMax = 72

const toolName = computed(() => toolPartDisplayName(props.part))
const presentation = computed(() => viewerPresentation(props.viewer))
const state = computed(() => getToolPartState(props.part))
const statusPresentation = computed(() => toolRunStatePresentation(state.value))
const statusLabel = computed(() => statusPresentation.value.label)
const statusTone = computed(() => statusPresentation.value.tone)

const todoItems = computed(() => {
  if (props.viewer !== 'todo') return null
  const todos = parseTodoToolPart(props.part)
  return todos && todos.length > 0 ? todos : null
})

const fileChanges = computed(() =>
  parseToolFileChanges(getToolPartOutput(props.part)),
)

const diffTotals = computed(() =>
  fileChanges.value.reduce(
    (acc, file) => ({
      added: acc.added + file.additions,
      removed: acc.removed + file.deletions,
    }),
    { added: 0, removed: 0 },
  ),
)

const filePreview = computed(() => extractFilePreview(props.part))
const patchPreview = computed(() => extractPatchPreview(props.part))

const truncatedFileContent = computed(() =>
  truncateDisplay(filePreview.value.content, maxLen),
)
const truncatedPatch = computed(() =>
  truncateDisplay(patchPreview.value.patch, maxLen),
)

const fileLanguage = computed(() =>
  guessLanguageFromCode(
    filePreview.value.content,
    guessLanguageFromPath(filePreview.value.path),
  ),
)

const terminalView = computed(() => extractTerminalView(props.part))
const truncatedCommand = computed(() =>
  truncateDisplay(terminalView.value.command, maxLen),
)
const terminalOutput = computed(() =>
  truncateDisplay(stripAnsi(terminalView.value.output), maxLen),
)

const commandLanguage = computed(() =>
  guessLanguageFromCode(
    terminalView.value.command,
    languageForTerminalSlot('command'),
  ),
)
const outputLanguage = computed(() =>
  guessLanguageFromCode(
    terminalView.value.output,
    languageForTerminalSlot('output'),
  ),
)

const genericOutput = computed(() => stripAnsi(formatToolOutput(props.part)))
const truncatedGenericOutput = computed(() =>
  truncateDisplay(genericOutput.value, maxLen),
)
const genericLanguage = computed(() =>
  guessLanguageFromCode(
    genericOutput.value,
    props.viewer === 'code' ? 'typescript' : 'json',
  ),
)

const errorText = computed(() =>
  truncateDisplay(getToolPartErrorText(props.part), 8_000),
)

const compactHint = computed(() => {
  if (errorText.value.trim()) {
    return truncateDisplay(errorText.value.replace(/\s+/g, ' ').trim(), compactHintMax)
  }

  switch (props.viewer) {
    case 'diff': {
      const files = fileChanges.value
      if (files.length === 1) {
        const file = files[0]!
        const stats =
          diffTotals.value.added || diffTotals.value.removed
            ? ` +${diffTotals.value.added} −${diffTotals.value.removed}`
            : ''
        return truncateDisplay(`${file.path}${stats}`, compactHintMax)
      }
      return `${files.length} files · +${diffTotals.value.added} −${diffTotals.value.removed}`
    }
    case 'patch':
      return truncateDisplay(patchPreview.value.path, compactHintMax)
    case 'file': {
      const lines = filePreview.value.content.split('\n').length
      return truncateDisplay(`${filePreview.value.path} · ${lines} lines`, compactHintMax)
    }
    case 'terminal': {
      const cmd = terminalView.value.command.trim()
      if (cmd) return truncateDisplay(cmd, compactHintMax)
      const out = terminalOutput.value.trim()
      return out ? truncateDisplay(out, compactHintMax) : ''
    }
    case 'todo':
      return todoItems.value ? `${todoItems.value.length} tasks` : ''
    default:
      return truncateDisplay(
        genericOutput.value.replace(/\s+/g, ' ').trim(),
        compactHintMax,
      )
  }
})

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[mGKHF]/g, '')
}

function guessLanguageFromPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'javascript'
  if (lower.endsWith('.vue')) return 'vue'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.rs')) return 'rust'
  if (lower.endsWith('.go')) return 'go'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.md')) return 'markdown'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.html')) return 'html'
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml'
  if (lower.endsWith('.sh')) return 'bash'
  return 'text'
}
</script>

<style scoped>
@import '@renderer/components/code/terminal-theme.css';

.conv-tool-response {
  align-self: flex-start;
  min-width: var(--chat-response-bubble-min-width, 50%);
  max-width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
  overflow: hidden;
}

.conv-tool-response--compact {
  min-width: 0;
  width: 100%;
}

.conv-tool-response--diff,
.conv-tool-response--patch {
  border-color: color-mix(in srgb, var(--color-warning-500, #f59e0b) 28%, var(--ui-border));
}

.conv-tool-response--file,
.conv-tool-response--code {
  border-color: color-mix(in srgb, var(--color-info-500, #0ea5e9) 28%, var(--ui-border));
}

.conv-tool-response--terminal {
  border-color: color-mix(in srgb, var(--color-primary-500, #6366f1) 24%, var(--ui-border));
}

.conv-tool-response__header {
  margin: 0;
}

.conv-tool-response--compact .conv-tool-response__header {
  border-bottom: none;
}

.conv-tool-response__toggle {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  margin: 0;
  padding: 6px 8px;
  border: none;
  background: var(--ui-bg-elevated);
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: inherit;
}

.conv-tool-response__toggle:hover {
  background: color-mix(in srgb, var(--ui-text) 4%, var(--ui-bg-elevated));
}

.conv-tool-response__toggle:focus-visible {
  outline: 2px solid var(--color-primary-500, #6366f1);
  outline-offset: -2px;
}

.conv-tool-response__chevron {
  width: 12px;
  height: 12px;
  margin-top: 2px;
  flex-shrink: 0;
  opacity: 0.75;
  color: var(--ui-text-muted);
}

.conv-tool-response__icon {
  width: 13px;
  height: 13px;
  margin-top: 2px;
  flex-shrink: 0;
  color: var(--ui-text-muted);
}

.conv-tool-response__title {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 6px;
  font-size: 12px;
}

.conv-tool-response__tool {
  font-family: var(--app-font-family);
  font-weight: 600;
  color: var(--ui-text);
}

.conv-tool-response__sep {
  color: var(--ui-text-muted);
  opacity: 0.65;
}

.conv-tool-response__badge {
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.conv-tool-response__status {
  font-size: 12px;
  color: var(--ui-text-muted);
}

.conv-tool-response__status--success {
  color: var(--color-success-600, #16a34a);
}

.conv-tool-response__status--error {
  color: var(--color-error-600, #dc2626);
}

.conv-tool-response__hint {
  flex: 1 1 100%;
  min-width: 0;
  font-family: var(--app-font-family);
  font-size: 11px;
  font-weight: 400;
  color: var(--ui-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-tool-response__body-wrap {
  border-top: 1px solid var(--ui-border);
}

.conv-tool-response__body {
  padding: 8px 10px;
}

.conv-tool-response__body--terminal {
  padding: 0;
}

.conv-tool-response__path {
  margin: 0 0 8px;
  font-family: var(--app-font-family);
  font-size: 12px;
  color: var(--ui-text-muted);
  word-break: break-all;
}

.conv-tool-response__slot {
  margin: 0;
  border-top: 1px solid var(--ui-border);
}

.conv-tool-response__slot summary {
  cursor: pointer;
  list-style: none;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ui-text-muted);
}

.conv-tool-response__slot summary::-webkit-details-marker {
  display: none;
}

.conv-tool-response__slot :deep(.shiki-surface) {
  margin: 0 10px 8px;
}

.conv-tool-response__error {
  padding: 8px 10px;
  border-top: 1px solid var(--ui-border);
  border-left: 3px solid var(--color-error-500, #ef4444);
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 6%, var(--ui-bg));
}
</style>
