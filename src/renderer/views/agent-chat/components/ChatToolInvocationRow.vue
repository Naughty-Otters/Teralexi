<template>
  <ChatTodoChecklist v-if="todoItems" :todos="todoItems" />
  <article
    v-else
    class="tr"
    :class="{ 'tr--minimal': minimalLayout, 'tr--compact': props.compact }"
  >
    <div
      class="tr__top"
      :class="{
        'tr__top--open':
          !props.compact && (showParams || showResult || showChanges),
      }"
    >
      <UIcon :name="toolIcon" class="tr__pin" aria-hidden="true" />
      <div class="tr__head">
        <div class="tr__title">
          <span class="tr__tool" :class="{ 'tr__tool--shimmer': isRunning }">{{ displayName }}</span>
          <span class="tr__sep" aria-hidden="true">·</span>
          <span class="tr__status" :class="`tr__status--${presentation.tone}`">
            {{ presentation.label }}
          </span>
          <span v-if="totals.added > 0 || totals.removed > 0" class="tr__diff-badge">
            <span v-if="totals.added > 0" class="tr__diff-add">+{{ totals.added }}</span>
            <span v-if="totals.removed > 0" class="tr__diff-del">−{{ totals.removed }}</span>
          </span>
          <span v-if="!props.compact" class="tr__toggles">
            <button
              v-if="fileChanges.length > 0"
              type="button"
              class="tr__toggle"
              :class="{ 'tr__toggle--active': showChanges }"
              :aria-expanded="showChanges"
              @click="showChanges = !showChanges"
            >
              Changes
            </button>
            <button
              v-if="inputText && fileChanges.length === 0"
              type="button"
              class="tr__toggle"
              :class="{ 'tr__toggle--active': showParams }"
              :aria-expanded="showParams"
              @click="showParams = !showParams"
            >
              Parameters
            </button>
            <button
              v-if="showRawOutput"
              type="button"
              class="tr__toggle"
              :class="{ 'tr__toggle--active': showResult }"
              :aria-expanded="showResult"
              @click="showResult = !showResult"
            >
              Raw result
            </button>
            <button
              v-if="showRawOutput && showResult"
              type="button"
              class="tr__copy"
              :class="{ 'tr__copy--ok': copied }"
              @click="copyOutput"
            >
              {{ copied ? 'Copied' : 'Copy' }}
            </button>
          </span>
        </div>
        <div v-if="!props.compact && showParams && inputText" class="tr__inline-panel">
          <ShikiCodeBlock
            :code="truncatedInput"
            :language="inputLanguage"
            variant="tool"
            compact
          />
        </div>
        <div v-if="!props.compact && showResult && showRawOutput" class="tr__inline-panel">
          <ShikiCodeBlock
            :code="truncatedOutput"
            :language="outputLanguage"
            variant="tool"
            compact
          />
        </div>
      </div>
    </div>

    <div
      v-if="!props.compact && showChanges && fileChanges.length > 0"
      class="tr__changes"
    >
      <FileChangeStack
        :files="fileChanges"
        compact
        :brief-lines="TOOL_LOOP_BRIEF_DIFF_LINES"
      />
    </div>

    <div v-if="!props.compact && errorText" class="tr__err" role="alert">
      <ShikiCodeBlock :code="errorText" language="text" variant="tool" compact />
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { guessLanguageFromCode } from '@renderer/lib/shiki/guess-language'
import { parseToolFileChanges } from '@shared/file-change/parse-tool-file-changes'
import ChatTodoChecklist from './ChatTodoChecklist.vue'
import { TOOL_LOOP_BRIEF_DIFF_LINES } from './chat/toolLoopPanelItems'
import {
  formatToolInput,
  formatToolOutput,
  getToolIcon,
  getToolPartErrorText,
  getToolPartOutput,
  getToolPartState,
  isRunningState,
  parseTodoToolPart,
  toolPartDisplayName,
  toolRunStatePresentation,
  truncateDisplay,
} from './chat/chatToolPartHelpers'

const FileChangeStack = defineAsyncComponent(
  () => import('./file-change/FileChangeStack.vue'),
)
const ShikiCodeBlock = defineAsyncComponent(
  () => import('@renderer/components/code/ShikiCodeBlock.vue'),
)

const props = withDefaults(
  defineProps<{ part: unknown; compact?: boolean }>(),
  { compact: false },
)

/** When this is an update_todos/read_todos result, render a live checklist. */
const todoItems = computed(() => {
  const todos = parseTodoToolPart(props.part)
  return todos && todos.length > 0 ? todos : null
})

const displayName = computed(() => toolPartDisplayName(props.part))
const state = computed(() => getToolPartState(props.part))
const presentation = computed(() => toolRunStatePresentation(state.value))
const toolIcon = computed(() => getToolIcon(displayName.value))
const isRunning = computed(() => isRunningState(state.value))

const rawInputText = computed(() => formatToolInput(props.part))
const rawOutputText = computed(() => formatToolOutput(props.part))
const errorText = computed(() => getToolPartErrorText(props.part))

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[mGKHF]/g, '')
}

const inputText = computed(() => rawInputText.value)
const outputText = computed(() => stripAnsi(rawOutputText.value))

const fileChanges = computed(() => parseToolFileChanges(getToolPartOutput(props.part)))

const totals = computed(() =>
  fileChanges.value.reduce(
    (acc, file) => ({
      added: acc.added + file.additions,
      removed: acc.removed + file.deletions,
    }),
    { added: 0, removed: 0 },
  ),
)

const minimalLayout = computed(
  () =>
    !inputText.value &&
    fileChanges.value.length === 0 &&
    !outputText.value &&
    !errorText.value,
)

const maxLen = 14_000
const truncatedInput = computed(() => truncateDisplay(inputText.value, maxLen))
const truncatedOutput = computed(() => truncateDisplay(outputText.value, maxLen))

const inputLanguage = computed(() =>
  guessLanguageFromCode(inputText.value, 'json'),
)
const outputLanguage = computed(() =>
  guessLanguageFromCode(outputText.value, 'text'),
)

const showRawOutput = computed(
  () => outputText.value.trim().length > 0 && fileChanges.value.length === 0,
)

const showParams = ref(false)
const showResult = ref(false)
/** File updates open by default so the brief diff box is visible like Cursor. */
const showChanges = ref(true)

const copied = ref(false)
function copyOutput() {
  void navigator.clipboard.writeText(outputText.value).then(() => {
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  })
}
</script>

<style scoped>
.tr {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
  max-width: 100%;
  font-size: 13px;
  line-height: 1.45;
  overflow: hidden;
}
.tr:has(.tr__changes) {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
.tr__top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--ui-border);
}
.tr__top--open {
  padding-bottom: 8px;
}
.tr--minimal .tr__top,
.tr--compact .tr__top {
  border-bottom: none;
}
.tr--compact .tr__top {
  padding: 6px 8px;
}
.tr__head {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tr__pin {
  width: 15px;
  height: 15px;
  margin-top: 2px;
  flex-shrink: 0;
  opacity: 0.55;
  color: var(--ui-text-muted);
}
.tr__title {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}
.tr__toggles {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.tr__toggle {
  margin: 0;
  padding: 1px 7px;
  border: 1px solid var(--ui-border);
  border-radius: 4px;
  background: var(--ui-bg-elevated, var(--ui-bg));
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.45;
  cursor: pointer;
  white-space: nowrap;
}
.tr__toggle:hover {
  color: var(--ui-text);
  border-color: color-mix(in srgb, var(--color-primary-500, #6366f1) 35%, var(--ui-border));
}
.tr__toggle--active {
  color: var(--color-primary-500, #6366f1);
  border-color: color-mix(in srgb, var(--color-primary-500, #6366f1) 45%, var(--ui-border));
  background: color-mix(in srgb, var(--color-primary-500, #6366f1) 8%, var(--ui-bg));
}
.tr__inline-panel :deep(.shiki-surface) {
  margin: 0;
  max-height: 200px;
}
.tr__tool {
  font-family: var(--app-font-family);
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text);
  word-break: break-word;
}

@keyframes tr-shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
.tr__tool--shimmer {
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
  animation: tr-shimmer 1.6s linear infinite;
}

.tr__sep {
  color: var(--ui-text-muted);
  font-weight: 400;
  opacity: 0.6;
}
.tr__status {
  font-size: 12px;
  color: var(--ui-text-muted);
}
.tr__status--success { color: var(--color-success-600, #16a34a); }
.tr__status--error   { color: var(--color-error-600, #dc2626); }
.tr__status--warn    { color: var(--color-warning-600, #d97706); }

.tr__diff-badge {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 11px;
  font-family: var(--app-font-family);
  font-weight: 600;
}
.tr__diff-add { color: var(--color-success-600, #16a34a); }
.tr__diff-del { color: var(--color-error-600, #dc2626); }

.tr__changes {
  padding: 0;
  margin: 0;
  border-bottom: none;
}
.tr__changes :deep(.fcs > .fc:last-child) {
  border-bottom: none;
}

.tr__copy {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 4px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated, var(--ui-bg));
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
  line-height: 1.45;
}
.tr__copy:hover { color: var(--ui-text); background: var(--ui-bg-accented); }
.tr__copy--ok { color: var(--color-success-600, #16a34a); border-color: var(--color-success-400, #4ade80); }
.tr__err {
  margin: 0;
  padding: 8px 10px;
  border-top: 1px solid var(--ui-border);
  border-left: 3px solid var(--color-error-500, #ef4444);
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 6%, var(--ui-bg));
}
.tr__err :deep(.shiki-surface) {
  margin: 0;
}
</style>
