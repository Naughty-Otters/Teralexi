<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.telegram }}</div>
    <div class="sp-card">
      <div class="sp-field">
        <label class="sp-label">{{ p.fields.botName }}</label>
        <input
          class="sp-input"
          :value="state.botName"
          placeholder="Teralexi Telegram Bot"
          @blur="saveBotName"
        />
      </div>

      <div class="sp-field">
        <label class="sp-label">{{ p.fields.botToken }}</label>
        <div class="tg-token-row">
          <input
            class="sp-input tg-token-input"
            :type="showToken ? 'text' : 'password'"
            :value="tokenInput"
            placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
            autocomplete="off"
            spellcheck="false"
            @input="onTokenInput"
            @keydown.enter.prevent="saveToken"
          />
          <button
            class="tg-toggle-btn"
            type="button"
            :title="showToken ? p.actions.hideToken : p.actions.showToken"
            @click="showToken = !showToken"
          >
            <UIcon :name="showToken ? 'i-lucide-eye-off' : 'i-lucide-eye'" />
          </button>
        </div>
        <div class="tg-token-hint">
          {{ p.channels.telegramTokenHint }}
        </div>
      </div>

      <div class="sp-status-row">
        <span
          class="connection-dot"
          :class="{
            'connection-dot--ok': state.status === 'connected',
            'connection-dot--err': state.status === 'error',
            'connection-dot--idle':
              state.status === 'idle' ||
              state.status === 'connecting' ||
              state.status === 'disconnected',
          }"
        />
        <span class="sp-status-label">{{ statusText }}</span>
        <span v-if="state.botUsername" class="tg-username">
          @{{ state.botUsername }}
        </span>
      </div>

      <button
        v-if="state.status !== 'connected'"
        type="button"
        class="tg-connect-btn"
        :disabled="loading || !tokenInput.trim()"
        @click="saveToken"
      >
        {{ loading ? p.status.connecting : p.actions.connectBot }}
      </button>

      <button
        v-if="state.status === 'connected'"
        type="button"
        class="tg-disconnect-btn"
        :disabled="loading"
        @click="stopBot"
      >
        {{ loading ? p.status.processing : p.actions.disconnectBot }}
      </button>

      <div v-if="state.status === 'connected'" class="tg-chat-panel">
        <div class="tg-chat-title">{{ p.channels.miniChat }}</div>
        <div class="tg-chat-list">
          <div
            v-for="msg in chatMessages"
            :key="msg.id"
            class="tg-chat-item"
            :class="{ 'tg-chat-item--me': msg.fromMe }"
          >
            {{ msg.text }}
          </div>
          <div v-if="chatMessages.length === 0" class="tg-chat-empty">
            {{ p.channels.noMessagesYet }}
          </div>
        </div>
        <div class="tg-chat-compose">
          <input
            v-model="chatInput"
            class="sp-input"
            :placeholder="p.channels.chatIdPlaceholder"
            style="max-width: 160px"
            @input="onChatIdInput"
          />
          <input
            v-model="chatText"
            class="sp-input"
            :placeholder="p.channels.typeMessage"
            :disabled="loading || !chatInput.trim()"
            @keydown.enter.prevent="sendChatMessage"
          />
          <button
            class="tg-chat-send"
            :disabled="loading || !chatInput.trim() || !chatText.trim()"
            @click="sendChatMessage"
          >
            {{ p.actions.send }}
          </button>
        </div>
      </div>

      <div v-if="state.lastError" class="tg-error">{{ state.lastError }}</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)

type TelegramState = {
  botName: string
  botToken: string
  botUsername: string | null
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
  lastError: string | null
}

type TelegramChatMessage = {
  id: string
  text: string
  fromMe: boolean
  timestamp: number
}

const state = ref<TelegramState>({
  botName: 'Teralexi Telegram Bot',
  botToken: '',
  botUsername: null,
  status: 'idle',
  lastError: null,
})

const loading = ref(false)
const showToken = ref(false)
const tokenInput = ref('')
const chatInput = ref('')
const chatText = ref('')
const chatMessages = ref<TelegramChatMessage[]>([])
let pollTimer: ReturnType<typeof setInterval> | null = null

const statusText = computed(() => {
  switch (state.value.status) {
    case 'connected':
      return p.value.status.connected
    case 'connecting':
      return p.value.status.connecting
    case 'disconnected':
      return p.value.status.disconnected
    case 'error':
      return p.value.status.error
    default:
      return p.value.status.idle
  }
})

async function loadState() {
  const channel = window.ipcRendererChannel?.GetTelegramState
  if (!channel?.invoke) return
  try {
    loading.value = true
    const result = (await channel.invoke()) as TelegramState
    state.value = result
    tokenInput.value = result.botToken
  } finally {
    loading.value = false
  }
}

async function saveBotName(event: Event) {
  const input = event.target as HTMLInputElement
  const channel = window.ipcRendererChannel?.SetTelegramBotName
  if (!channel?.invoke) return
  const result = (await channel.invoke({
    botName: input.value,
  })) as TelegramState
  state.value = result
}

function onTokenInput(event: Event) {
  const input = event.target as HTMLInputElement
  tokenInput.value = input.value
}

async function saveToken() {
  const channel = window.ipcRendererChannel?.SetTelegramBotToken
  if (!channel?.invoke) return
  try {
    loading.value = true
    const result = (await channel.invoke({
      botToken: tokenInput.value,
    })) as TelegramState
    state.value = result
    tokenInput.value = result.botToken
    if (result.status === 'connected') {
      await pollChatMessages()
      startPolling()
    }
  } finally {
    loading.value = false
  }
}

async function stopBot() {
  const channel = window.ipcRendererChannel?.StopTelegramBot
  if (!channel?.invoke) return
  try {
    loading.value = true
    const result = (await channel.invoke()) as TelegramState
    state.value = result
  } finally {
    loading.value = false
  }
}

async function pollChatMessages() {
  const channel = window.ipcRendererChannel?.GetTelegramChatMessages
  if (!channel?.invoke) return
  try {
    chatMessages.value = (await channel.invoke()) as TelegramChatMessage[]
  } catch {
    // Ignore poll errors
  }
}

function onChatIdInput(event: Event) {
  const input = event.target as HTMLInputElement
  chatInput.value = input.value.replace(/[^0-9-]/g, '')
}

async function sendChatMessage() {
  const text = chatText.value.trim()
  const chatId = chatInput.value.trim()
  if (!text || !chatId) return
  const channel = window.ipcRendererChannel?.SendTelegramChatMessage
  if (!channel?.invoke) return
  try {
    loading.value = true
    chatMessages.value = (await channel.invoke({
      chatId,
      text,
    })) as TelegramChatMessage[]
    chatText.value = ''
  } finally {
    loading.value = false
  }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(pollChatMessages, 2000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(async () => {
  await loadState()
  if (state.value.status === 'connected') {
    await pollChatMessages()
    startPolling()
  }
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
@import './sp-shared.css';

.sp-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  padding: 20px;
}

.tg-token-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.tg-token-input {
  flex: 1;
  font-family: var(--app-font-family);
  font-size: 12px;
  letter-spacing: 0.02em;
}

.tg-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
  color: var(--ui-text-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.tg-toggle-btn:hover {
  background: var(--ui-bg-accented);
  color: var(--ui-text);
}

.tg-token-hint {
  font-size: 11px;
  color: var(--ui-text-muted);
  line-height: 1.5;
}

.sp-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.connection-dot--ok {
  background: var(--color-success-500, #22c55e);
}

.connection-dot--err {
  background: var(--color-error-500, #ef4444);
}

.connection-dot--idle {
  background: var(--ui-text-muted);
}

.sp-status-label {
  font-size: 12px;
  color: var(--ui-text-muted);
  font-weight: 500;
}

.tg-username {
  font-size: 12px;
  color: var(--color-primary-500);
  font-family: var(--app-font-family);
}

.tg-connect-btn,
.tg-disconnect-btn {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.12s;
  align-self: flex-start;
}

.tg-connect-btn {
  background: #229ed9;
  color: #fff;
}

.tg-disconnect-btn {
  background: var(--color-error-500, #ef4444);
  color: #fff;
}

.tg-connect-btn:disabled,
.tg-disconnect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tg-chat-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.tg-chat-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.tg-chat-list {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 8px;
}

.tg-chat-item {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 13px;
  max-width: 80%;
  word-break: break-word;
  background: var(--ui-bg-accented);
  color: var(--ui-text);
  align-self: flex-start;
}

.tg-chat-item--me {
  align-self: flex-end;
  background: #229ed9;
  color: #fff;
}

.tg-chat-empty {
  font-size: 12px;
  color: var(--ui-text-muted);
  text-align: center;
  padding: 12px 0;
}

.tg-chat-compose {
  display: flex;
  gap: 6px;
  align-items: center;
}

.tg-chat-send {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  background: #229ed9;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
}

.tg-chat-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tg-error {
  color: var(--color-error-500, #ef4444);
  font-size: 12px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 8%, transparent);
  border-radius: 8px;
}
</style>
