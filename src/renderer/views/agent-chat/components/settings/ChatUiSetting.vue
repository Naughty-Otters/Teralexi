<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.chatUi }}</div>
    <p class="chat-ui-intro">{{ t.chatUi.intro }}</p>

    <div v-if="loading" class="chat-ui-loading">{{ t.common.loading }}</div>

    <div v-else class="sp-card chat-ui-card">
      <div class="chat-ui-row">
        <div class="chat-ui-row-text">
          <span class="chat-ui-row-title">{{ t.chatUi.preservedTextTitle }}</span>
          <span class="chat-ui-row-desc">{{ t.chatUi.preservedTextDesc }}</span>
        </div>
        <div class="chat-ui-control-wrap">
          <input
            class="sp-input chat-ui-number-input"
            type="number"
            :min="MIN_CHAT_UI_BUBBLE_TEXT_KEEP_CHARS"
            :max="MAX_CHAT_UI_BUBBLE_TEXT_KEEP_CHARS"
            :value="draft.bubbleTextKeepChars"
            :disabled="saving === 'bubbleTextKeepChars'"
            @change="onKeepCharsChange"
          />
          <span class="chat-ui-control-hint">{{ t.common.chars }}</span>
        </div>
      </div>

      <div class="chat-ui-row">
        <div class="chat-ui-row-text">
          <span class="chat-ui-row-title">{{ t.chatUi.compactHeightTitle }}</span>
          <span class="chat-ui-row-desc">{{ t.chatUi.compactHeightDesc }}</span>
        </div>
        <div class="chat-ui-control-wrap">
          <input
            class="sp-input chat-ui-number-input"
            type="number"
            :min="MIN_CHAT_UI_BUBBLE_COMPACT_LINES"
            :max="MAX_CHAT_UI_BUBBLE_COMPACT_LINES"
            :value="draft.bubbleCompactLines"
            :disabled="saving === 'bubbleCompactLines'"
            @change="onCompactLinesChange"
          />
          <span class="chat-ui-control-hint">{{ t.common.lines }}</span>
        </div>
      </div>

      <div class="chat-ui-row">
        <div class="chat-ui-row-text">
          <span class="chat-ui-row-title">{{ t.chatUi.contextWindowTitle }}</span>
          <span class="chat-ui-row-desc">{{ t.chatUi.contextWindowDesc }}</span>
        </div>
        <div class="chat-ui-control-wrap">
          <input
            class="sp-input chat-ui-number-input"
            type="number"
            :min="MIN_CHAT_UI_CONTEXT_WINDOW_MESSAGES"
            :max="MAX_CHAT_UI_CONTEXT_WINDOW_MESSAGES"
            :value="draft.contextWindowMessages"
            :disabled="saving === 'contextWindowMessages'"
            @change="onContextWindowChange"
          />
          <span class="chat-ui-control-hint">{{ t.common.msgs }}</span>
        </div>
      </div>

      <div class="chat-ui-row">
        <div class="chat-ui-row-text">
          <span class="chat-ui-row-title">{{ t.chatUi.reasoningMaxTitle }}</span>
          <span class="chat-ui-row-desc">{{ t.chatUi.reasoningMaxDesc }}</span>
        </div>
        <div class="chat-ui-control-wrap">
          <input
            class="sp-input chat-ui-number-input"
            type="number"
            :min="MIN_CHAT_UI_REASONING_MAX_CHARS"
            :max="MAX_CHAT_UI_REASONING_MAX_CHARS"
            :value="draft.reasoningMaxChars"
            :disabled="saving === 'reasoningMaxChars'"
            @change="onReasoningMaxChange"
          />
          <span class="chat-ui-control-hint">{{ t.common.chars }}</span>
        </div>
      </div>

      <div class="chat-ui-row chat-ui-row--select">
        <div class="chat-ui-row-text">
          <span class="chat-ui-row-title">{{ t.chatUi.thinkingBubbleTitle }}</span>
          <span class="chat-ui-row-desc">{{ t.chatUi.thinkingBubbleDesc }}</span>
        </div>
        <select
          class="sp-input sp-select chat-ui-select"
          :value="draft.thinkingBubbleDisplay"
          :disabled="saving === 'thinkingBubbleDisplay'"
          @change="onThinkingBubbleDisplayChange"
        >
          <option value="none">{{ t.chatUi.thinkingBubbleNone }}</option>
          <option value="all">{{ t.chatUi.thinkingBubbleAll }}</option>
          <option value="latest">{{ t.chatUi.thinkingBubbleLatest }}</option>
        </select>
      </div>

      <div class="chat-ui-row chat-ui-row--select">
        <div class="chat-ui-row-text">
          <span class="chat-ui-row-title">{{ t.chatUi.showAgenticRunTitle }}</span>
          <span class="chat-ui-row-desc">{{ t.chatUi.showAgenticRunDesc }}</span>
        </div>
        <select
          class="sp-input sp-select chat-ui-select"
          :value="draft.toolCallListDisplay"
          :disabled="saving === 'toolCallListDisplay'"
          @change="onToolCallListDisplayChange"
        >
          <option value="none">{{ t.chatUi.toolCallListNone }}</option>
          <option value="all">{{ t.chatUi.toolCallListAll }}</option>
          <option value="latest">{{ t.chatUi.toolCallListLatest }}</option>
        </select>
      </div>

      <p class="chat-ui-footnote">{{ defaultsFootnote }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import {
  DEFAULT_CHAT_UI_SETTINGS,
  MAX_CHAT_UI_BUBBLE_COMPACT_LINES,
  MAX_CHAT_UI_BUBBLE_TEXT_KEEP_CHARS,
  MAX_CHAT_UI_CONTEXT_WINDOW_MESSAGES,
  MAX_CHAT_UI_REASONING_MAX_CHARS,
  MIN_CHAT_UI_BUBBLE_COMPACT_LINES,
  MIN_CHAT_UI_BUBBLE_TEXT_KEEP_CHARS,
  MIN_CHAT_UI_CONTEXT_WINDOW_MESSAGES,
  MIN_CHAT_UI_REASONING_MAX_CHARS,
  clampChatUiBubbleCompactLines,
  clampChatUiBubbleTextKeepChars,
  clampChatUiContextWindowMessages,
  clampChatUiReasoningMaxChars,
  type ChatUiSettings,
  type ChatUiThinkingBubbleDisplay,
  type ChatUiToolCallListDisplay,
  parseChatUiThinkingBubbleDisplay,
  parseChatUiToolCallListDisplay,
} from '@shared/agent/chat-ui-settings'
import { loadChatUiSettings, saveChatUiSettings } from '../../chatUiSettings'
import './sp-shared.css'

const { t } = useI18n()

const loading = ref(true)
const saving = ref<keyof ChatUiSettings | null>(null)
const draft = reactive({ ...DEFAULT_CHAT_UI_SETTINGS })

const defaultsFootnote = computed(() =>
  t.value.chatUi.defaultsFootnote
    .replace('{keepChars}', String(DEFAULT_CHAT_UI_SETTINGS.bubbleTextKeepChars))
    .replace('{compactLines}', String(DEFAULT_CHAT_UI_SETTINGS.bubbleCompactLines))
    .replace(
      '{contextMessages}',
      String(DEFAULT_CHAT_UI_SETTINGS.contextWindowMessages),
    )
    .replace(
      '{reasoningMax}',
      String(DEFAULT_CHAT_UI_SETTINGS.reasoningMaxChars),
    ),
)

async function loadSettings(): Promise<void> {
  loading.value = true
  try {
    const settings = await loadChatUiSettings()
    draft.bubbleTextKeepChars = settings.bubbleTextKeepChars
    draft.bubbleCompactLines = settings.bubbleCompactLines
    draft.contextWindowMessages = settings.contextWindowMessages
    draft.reasoningMaxChars = settings.reasoningMaxChars
    draft.thinkingBubbleDisplay = settings.thinkingBubbleDisplay
    draft.toolCallListDisplay = settings.toolCallListDisplay
  } finally {
    loading.value = false
  }
}

async function persist(partial: Partial<ChatUiSettings>): Promise<void> {
  const key = Object.keys(partial)[0] as keyof ChatUiSettings | undefined
  if (!key) return
  saving.value = key
  try {
    const next = await saveChatUiSettings({
      bubbleTextKeepChars: draft.bubbleTextKeepChars,
      bubbleCompactLines: draft.bubbleCompactLines,
      contextWindowMessages: draft.contextWindowMessages,
      reasoningMaxChars: draft.reasoningMaxChars,
      thinkingBubbleDisplay: draft.thinkingBubbleDisplay,
      toolCallListDisplay: draft.toolCallListDisplay,
      ...partial,
    })
    draft.bubbleTextKeepChars = next.bubbleTextKeepChars
    draft.bubbleCompactLines = next.bubbleCompactLines
    draft.contextWindowMessages = next.contextWindowMessages
    draft.reasoningMaxChars = next.reasoningMaxChars
    draft.thinkingBubbleDisplay = next.thinkingBubbleDisplay
    draft.toolCallListDisplay = next.toolCallListDisplay
  } finally {
    saving.value = null
  }
}

function onKeepCharsChange(event: Event): void {
  const raw = Number.parseInt(
    (event.target as HTMLInputElement).value,
    10,
  )
  const next = clampChatUiBubbleTextKeepChars(raw)
  draft.bubbleTextKeepChars = next
  void persist({ bubbleTextKeepChars: next })
}

function onCompactLinesChange(event: Event): void {
  const raw = Number.parseInt(
    (event.target as HTMLInputElement).value,
    10,
  )
  const next = clampChatUiBubbleCompactLines(raw)
  draft.bubbleCompactLines = next
  void persist({ bubbleCompactLines: next })
}

function onContextWindowChange(event: Event): void {
  const raw = Number.parseInt(
    (event.target as HTMLInputElement).value,
    10,
  )
  const next = clampChatUiContextWindowMessages(raw)
  draft.contextWindowMessages = next
  void persist({ contextWindowMessages: next })
}

function onReasoningMaxChange(event: Event): void {
  const raw = Number.parseInt(
    (event.target as HTMLInputElement).value,
    10,
  )
  const next = clampChatUiReasoningMaxChars(raw)
  draft.reasoningMaxChars = next
  void persist({ reasoningMaxChars: next })
}

function onThinkingBubbleDisplayChange(event: Event): void {
  const next = parseChatUiThinkingBubbleDisplay(
    (event.target as HTMLSelectElement).value,
    draft.thinkingBubbleDisplay,
  )
  draft.thinkingBubbleDisplay = next
  void persist({ thinkingBubbleDisplay: next })
}

function onToolCallListDisplayChange(event: Event): void {
  const next = parseChatUiToolCallListDisplay(
    (event.target as HTMLSelectElement).value,
    draft.toolCallListDisplay,
  )
  draft.toolCallListDisplay = next
  void persist({ toolCallListDisplay: next })
}

onMounted(() => {
  void loadSettings()
})
</script>

<style scoped>
.chat-ui-intro {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.chat-ui-footnote {
  margin: 4px 0 0;
  padding-top: 14px;
  border-top: 1px solid var(--ui-border);
  font-size: 12px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.chat-ui-loading {
  font-size: 13px;
  color: var(--ui-text-muted);
}

.chat-ui-card {
  gap: 0;
}

.chat-ui-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 0;
}

.chat-ui-row + .chat-ui-row {
  border-top: 1px solid var(--ui-border);
  padding-top: 14px;
  margin-top: 4px;
}

.chat-ui-row--select {
  align-items: center;
}

.chat-ui-row-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.chat-ui-row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
}

.chat-ui-row-desc {
  font-size: 13px;
  line-height: 1.45;
  color: var(--ui-text-muted);
}

.chat-ui-control-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.chat-ui-number-input {
  width: 5.5rem;
  text-align: right;
}

.chat-ui-control-hint {
  font-size: 12px;
  color: var(--ui-text-muted);
  min-width: 2.5rem;
}

.chat-ui-select {
  width: 12rem;
  flex-shrink: 0;
}

.chat-ui-card :deep(.sp-input:disabled) {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
