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
        <div class="chat-ui-input-wrap">
          <input
            class="chat-ui-input aft-input"
            type="number"
            :min="MIN_CHAT_UI_BUBBLE_TEXT_KEEP_CHARS"
            :max="MAX_CHAT_UI_BUBBLE_TEXT_KEEP_CHARS"
            :value="draft.bubbleTextKeepChars"
            :disabled="saving === 'bubbleTextKeepChars'"
            @change="onKeepCharsChange"
          />
          <span class="chat-ui-input-hint">{{ t.common.chars }}</span>
        </div>
      </div>

      <div class="chat-ui-row">
        <div class="chat-ui-row-text">
          <span class="chat-ui-row-title">{{ t.chatUi.compactHeightTitle }}</span>
          <span class="chat-ui-row-desc">{{ t.chatUi.compactHeightDesc }}</span>
        </div>
        <div class="chat-ui-input-wrap">
          <input
            class="chat-ui-input aft-input"
            type="number"
            :min="MIN_CHAT_UI_BUBBLE_COMPACT_LINES"
            :max="MAX_CHAT_UI_BUBBLE_COMPACT_LINES"
            :value="draft.bubbleCompactLines"
            :disabled="saving === 'bubbleCompactLines'"
            @change="onCompactLinesChange"
          />
          <span class="chat-ui-input-hint">{{ t.common.lines }}</span>
        </div>
      </div>

      <div class="chat-ui-row">
        <div class="chat-ui-row-text">
          <span class="chat-ui-row-title">{{ t.chatUi.contextWindowTitle }}</span>
          <span class="chat-ui-row-desc">{{ t.chatUi.contextWindowDesc }}</span>
        </div>
        <div class="chat-ui-input-wrap">
          <input
            class="chat-ui-input aft-input"
            type="number"
            :min="MIN_CHAT_UI_CONTEXT_WINDOW_MESSAGES"
            :max="MAX_CHAT_UI_CONTEXT_WINDOW_MESSAGES"
            :value="draft.contextWindowMessages"
            :disabled="saving === 'contextWindowMessages'"
            @change="onContextWindowChange"
          />
          <span class="chat-ui-input-hint">{{ t.common.msgs }}</span>
        </div>
      </div>

      <div class="chat-ui-row">
        <div class="chat-ui-row-text">
          <span class="chat-ui-row-title">{{ t.chatUi.reasoningMaxTitle }}</span>
          <span class="chat-ui-row-desc">{{ t.chatUi.reasoningMaxDesc }}</span>
        </div>
        <div class="chat-ui-input-wrap">
          <input
            class="chat-ui-input aft-input"
            type="number"
            :min="MIN_CHAT_UI_REASONING_MAX_CHARS"
            :max="MAX_CHAT_UI_REASONING_MAX_CHARS"
            :value="draft.reasoningMaxChars"
            :disabled="saving === 'reasoningMaxChars'"
            @change="onReasoningMaxChange"
          />
          <span class="chat-ui-input-hint">{{ t.common.chars }}</span>
        </div>
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
      ...partial,
    })
    draft.bubbleTextKeepChars = next.bubbleTextKeepChars
    draft.bubbleCompactLines = next.bubbleCompactLines
    draft.contextWindowMessages = next.contextWindowMessages
    draft.reasoningMaxChars = next.reasoningMaxChars
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

onMounted(() => {
  void loadSettings()
})
</script>

<style scoped>
.chat-ui-intro,
.chat-ui-footnote {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.chat-ui-footnote {
  margin: 12px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--ui-border);
}

.chat-ui-loading {
  font-size: 13px;
  color: var(--ui-text-muted);
}

.chat-ui-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chat-ui-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.chat-ui-row-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.chat-ui-row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
}

.chat-ui-row-desc {
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
}

.chat-ui-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.chat-ui-input {
  width: 5.5rem;
  text-align: right;
}

.chat-ui-input-hint {
  font-size: 12px;
  color: var(--ui-text-muted);
  min-width: 2.5rem;
}
</style>
