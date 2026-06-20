<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.discord }}</div>
    <div class="sp-card">
      <div class="sp-field">
        <label class="sp-label">{{ p.fields.botName }}</label>
        <input
          class="sp-input"
          :value="state.botName"
          placeholder="OpenFDE Discord Bot"
          @blur="saveBotName"
        />
      </div>

      <div class="sp-field">
        <label class="sp-label">{{ p.fields.botToken }}</label>
        <div class="dc-token-row">
          <input
            class="sp-input dc-token-input"
            :type="showToken ? 'text' : 'password'"
            :value="tokenInput"
            placeholder="MTIz...your-bot-token"
            autocomplete="off"
            spellcheck="false"
            @input="onTokenInput"
            @blur="saveToken"
            @keydown.enter.prevent="saveToken"
          />
          <button
            class="dc-toggle-btn"
            type="button"
            :title="showToken ? p.actions.hideToken : p.actions.showToken"
            @click="showToken = !showToken"
          >
            <UIcon :name="showToken ? 'i-lucide-eye-off' : 'i-lucide-eye'" />
          </button>
        </div>
        <div class="dc-token-hint">
          Create a bot at the
          <a
            href="#"
            class="dc-link"
            @click.prevent="openDevPortal"
          >Discord Developer Portal</a>.
          Enable <strong>Message Content Intent</strong> under Privileged Gateway Intents.
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
        <span v-if="state.botUsername" class="dc-username">
          {{ state.botUsername }}
        </span>
      </div>

      <button
        v-if="state.status !== 'connected'"
        class="dc-connect-btn"
        :disabled="loading || !tokenInput.trim()"
        @click="saveToken"
      >
        {{ loading ? p.status.connecting : p.actions.connectBot }}
      </button>

      <button
        v-if="state.status === 'connected'"
        class="dc-disconnect-btn"
        :disabled="loading"
        @click="stopBot"
      >
        {{ loading ? p.status.processing : p.actions.disconnectBot }}
      </button>

      <div v-if="state.status === 'connected'" class="dc-chat-panel">
        <div class="dc-chat-title">{{ p.channels.miniChat }}</div>
        <div class="dc-chat-list">
          <div
            v-for="msg in chatMessages"
            :key="msg.id"
            class="dc-chat-item"
            :class="{ 'dc-chat-item--me': msg.fromMe }"
          >
            {{ msg.text }}
          </div>
          <div v-if="chatMessages.length === 0" class="dc-chat-empty">
            {{ p.channels.noMessagesYet }}
          </div>
        </div>
        <div class="dc-chat-compose">
          <input
            v-model="chatChannelId"
            class="sp-input"
            placeholder="Channel ID"
            style="max-width: 180px"
          />
          <input
            v-model="chatText"
            class="sp-input"
            :placeholder="p.channels.typeMessage"
            :disabled="loading || !chatChannelId.trim()"
            @keydown.enter.prevent="sendChatMessage"
          />
          <button
            class="dc-chat-send"
            :disabled="loading || !chatChannelId.trim() || !chatText.trim()"
            @click="sendChatMessage"
          >
            {{ p.actions.send }}
          </button>
        </div>
      </div>

      <div v-if="state.lastError" class="dc-error">{{ state.lastError }}</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)

type DiscordState = {
  botName: string
  botToken: string
  botUsername: string | null
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
  lastError: string | null
}

type DiscordChatMessage = {
  id: string
  text: string
  fromMe: boolean
  timestamp: number
}

const state = ref<DiscordState>({
  botName: 'OpenFDE Discord Bot',
  botToken: '',
  botUsername: null,
  status: 'idle',
  lastError: null,
})

const loading = ref(false)
const showToken = ref(false)
const tokenInput = ref('')
const chatChannelId = ref('')
const chatText = ref('')
const chatMessages = ref<DiscordChatMessage[]>([])
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
  const channel = window.ipcRendererChannel?.GetDiscordState
  if (!channel?.invoke) return
  try {
    loading.value = true
    const result = (await channel.invoke()) as DiscordState
    state.value = result
    tokenInput.value = result.botToken
  } finally {
    loading.value = false
  }
}

async function saveBotName(event: Event) {
  const input = event.target as HTMLInputElement
  const channel = window.ipcRendererChannel?.SetDiscordBotName
  if (!channel?.invoke) return
  const result = (await channel.invoke({
    botName: input.value,
  })) as DiscordState
  state.value = result
}

function onTokenInput(event: Event) {
  const input = event.target as HTMLInputElement
  tokenInput.value = input.value
}

async function saveToken() {
  const channel = window.ipcRendererChannel?.SetDiscordBotToken
  if (!channel?.invoke) return
  try {
    loading.value = true
    const result = (await channel.invoke({
      botToken: tokenInput.value,
    })) as DiscordState
    state.value = result
    tokenInput.value = result.botToken
  } finally {
    loading.value = false
  }
}

async function stopBot() {
  const channel = window.ipcRendererChannel?.StopDiscordBot
  if (!channel?.invoke) return
  try {
    loading.value = true
    const result = (await channel.invoke()) as DiscordState
    state.value = result
  } finally {
    loading.value = false
  }
}

async function pollChatMessages() {
  const channel = window.ipcRendererChannel?.GetDiscordChatMessages
  if (!channel?.invoke) return
  try {
    chatMessages.value = (await channel.invoke()) as DiscordChatMessage[]
  } catch {
    // Ignore poll errors
  }
}

async function sendChatMessage() {
  const text = chatText.value.trim()
  const channelId = chatChannelId.value.trim()
  if (!text || !channelId) return
  const channel = window.ipcRendererChannel?.SendDiscordChatMessage
  if (!channel?.invoke) return
  try {
    loading.value = true
    chatMessages.value = (await channel.invoke({
      channelId,
      text,
    })) as DiscordChatMessage[]
    chatText.value = ''
  } finally {
    loading.value = false
  }
}

function openDevPortal() {
  window.open('https://discord.com/developers/applications', '_blank')
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

.dc-token-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.dc-token-input {
  flex: 1;
  font-family: var(--app-font-family);
  font-size: 12px;
  letter-spacing: 0.02em;
}

.dc-toggle-btn {
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

.dc-toggle-btn:hover {
  background: var(--ui-bg-accented);
  color: var(--ui-text);
}

.dc-token-hint {
  font-size: 11px;
  color: var(--ui-text-muted);
  line-height: 1.5;
}

.dc-link {
  color: var(--color-primary-500);
  text-decoration: none;
}

.dc-link:hover {
  text-decoration: underline;
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

.dc-username {
  font-size: 12px;
  color: var(--color-primary-500);
  font-family: var(--app-font-family);
}

.dc-connect-btn,
.dc-disconnect-btn {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.12s;
  align-self: flex-start;
}

.dc-connect-btn {
  background: #5865F2;
  color: #fff;
}

.dc-disconnect-btn {
  background: var(--color-error-500, #ef4444);
  color: #fff;
}

.dc-connect-btn:disabled,
.dc-disconnect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dc-chat-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.dc-chat-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.dc-chat-list {
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

.dc-chat-item {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 13px;
  max-width: 80%;
  word-break: break-word;
  background: var(--ui-bg-accented);
  color: var(--ui-text);
  align-self: flex-start;
}

.dc-chat-item--me {
  align-self: flex-end;
  background: #5865F2;
  color: #fff;
}

.dc-chat-empty {
  font-size: 12px;
  color: var(--ui-text-muted);
  text-align: center;
  padding: 12px 0;
}

.dc-chat-compose {
  display: flex;
  gap: 6px;
  align-items: center;
}

.dc-chat-send {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  background: #5865F2;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
}

.dc-chat-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dc-error {
  color: var(--color-error-500, #ef4444);
  font-size: 12px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 8%, transparent);
  border-radius: 8px;
}
</style>
