<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.slack }}</div>
    <div class="sp-card">
      <div class="sp-field">
        <label class="sp-label">{{ p.fields.botName }}</label>
        <input
          class="sp-input"
          :value="state.botName"
          placeholder="OpenFDE Slack Bot"
          @blur="saveBotName"
        />
      </div>

      <div class="sp-field">
        <label class="sp-label">{{ p.fields.botToken }}</label>
        <div class="sl-token-row">
          <input
            class="sp-input sl-token-input"
            :type="showBotToken ? 'text' : 'password'"
            :value="botTokenInput"
            placeholder="xoxb-..."
            autocomplete="off"
            spellcheck="false"
            @input="onBotTokenInput"
          />
          <button
            class="sl-toggle-btn"
            type="button"
            :title="showBotToken ? p.actions.hideToken : p.actions.showToken"
            @click="showBotToken = !showBotToken"
          >
            <UIcon :name="showBotToken ? 'i-lucide-eye-off' : 'i-lucide-eye'" />
          </button>
        </div>
      </div>

      <div class="sp-field">
        <label class="sp-label">{{ p.fields.appToken }}</label>
        <div class="sl-token-row">
          <input
            class="sp-input sl-token-input"
            :type="showAppToken ? 'text' : 'password'"
            :value="appTokenInput"
            placeholder="xapp-..."
            autocomplete="off"
            spellcheck="false"
            @input="onAppTokenInput"
          />
          <button
            class="sl-toggle-btn"
            type="button"
            :title="showAppToken ? p.actions.hideToken : p.actions.showToken"
            @click="showAppToken = !showAppToken"
          >
            <UIcon :name="showAppToken ? 'i-lucide-eye-off' : 'i-lucide-eye'" />
          </button>
        </div>
        <div class="sl-app-token-hint">
          {{ p.channels.slackAppTokenHint }}
        </div>
      </div>

      <div class="sl-hint">
        Create a Slack app at the
        <a
          href="#"
          class="sl-link"
          @click.prevent="openSlackApps"
        >Slack API dashboard</a>.
        Enable <strong>Socket Mode</strong> and grant <code>chat:write</code>
        and <code>app_mentions:read</code> bot scopes.
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
        <span v-if="state.botUserId" class="sl-user-id">
          {{ state.botUserId }}
        </span>
      </div>

      <button
        v-if="state.status !== 'connected'"
        class="sl-connect-btn"
        :disabled="loading || !canConnect"
        @click="saveTokens"
      >
        {{ loading ? p.status.connecting : p.actions.connectBot }}
      </button>

      <button
        v-if="state.status === 'connected'"
        class="sl-disconnect-btn"
        :disabled="loading"
        @click="stopBot"
      >
        {{ loading ? p.status.processing : p.actions.disconnectBot }}
      </button>

      <div v-if="state.status === 'connected'" class="sl-chat-panel">
        <div class="sl-chat-title">{{ p.channels.miniChat }}</div>
        <div class="sl-chat-list">
          <div
            v-for="msg in chatMessages"
            :key="msg.id"
            class="sl-chat-item"
            :class="{ 'sl-chat-item--me': msg.fromMe }"
          >
            {{ msg.text }}
          </div>
          <div v-if="chatMessages.length === 0" class="sl-chat-empty">
            {{ p.channels.noMessagesYet }}
          </div>
        </div>
        <div class="sl-chat-compose">
          <input
            v-model="chatChannelId"
            class="sp-input"
            placeholder="Channel ID (C0123…)"
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
            class="sl-chat-send"
            :disabled="loading || !chatChannelId.trim() || !chatText.trim()"
            @click="sendChatMessage"
          >
            {{ p.actions.send }}
          </button>
        </div>
      </div>

      <div v-if="state.lastError" class="sl-error">{{ state.lastError }}</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)

type SlackState = {
  botName: string
  botToken: string
  appToken: string
  botUserId: string | null
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
  lastError: string | null
}

type SlackChatMessage = {
  id: string
  text: string
  fromMe: boolean
  timestamp: number
}

const state = ref<SlackState>({
  botName: 'OpenFDE Slack Bot',
  botToken: '',
  appToken: '',
  botUserId: null,
  status: 'idle',
  lastError: null,
})

const loading = ref(false)
const showBotToken = ref(false)
const showAppToken = ref(false)
const botTokenInput = ref('')
const appTokenInput = ref('')
const chatChannelId = ref('')
const chatText = ref('')
const chatMessages = ref<SlackChatMessage[]>([])
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

const canConnect = computed(() => {
  return botTokenInput.value.trim() && appTokenInput.value.trim()
})

async function loadState() {
  const channel = window.ipcRendererChannel?.GetSlackState
  if (!channel?.invoke) return
  try {
    loading.value = true
    const result = (await channel.invoke()) as SlackState
    state.value = result
    botTokenInput.value = result.botToken
    appTokenInput.value = result.appToken
  } finally {
    loading.value = false
  }
}

async function saveBotName(event: Event) {
  const input = event.target as HTMLInputElement
  const channel = window.ipcRendererChannel?.SetSlackBotName
  if (!channel?.invoke) return
  const result = (await channel.invoke({
    botName: input.value,
  })) as SlackState
  state.value = result
}

function onBotTokenInput(event: Event) {
  botTokenInput.value = (event.target as HTMLInputElement).value
}

function onAppTokenInput(event: Event) {
  appTokenInput.value = (event.target as HTMLInputElement).value
}

async function saveTokens() {
  const channel = window.ipcRendererChannel?.SetSlackTokens
  if (!channel?.invoke) return
  try {
    loading.value = true
    const result = (await channel.invoke({
      botToken: botTokenInput.value,
      appToken: appTokenInput.value,
    })) as SlackState
    state.value = result
    botTokenInput.value = result.botToken
    appTokenInput.value = result.appToken
    if (result.status === 'connected') {
      await pollChatMessages()
      startPolling()
    }
  } finally {
    loading.value = false
  }
}

async function stopBot() {
  const channel = window.ipcRendererChannel?.StopSlackBot
  if (!channel?.invoke) return
  try {
    loading.value = true
    const result = (await channel.invoke()) as SlackState
    state.value = result
    stopPolling()
  } finally {
    loading.value = false
  }
}

async function pollChatMessages() {
  const channel = window.ipcRendererChannel?.GetSlackChatMessages
  if (!channel?.invoke) return
  try {
    chatMessages.value = (await channel.invoke()) as SlackChatMessage[]
  } catch {
    // Ignore poll errors
  }
}

async function sendChatMessage() {
  const text = chatText.value.trim()
  const channelId = chatChannelId.value.trim()
  if (!text || !channelId) return
  const channel = window.ipcRendererChannel?.SendSlackChatMessage
  if (!channel?.invoke) return
  try {
    loading.value = true
    chatMessages.value = (await channel.invoke({
      channelId,
      text,
    })) as SlackChatMessage[]
    chatText.value = ''
  } finally {
    loading.value = false
  }
}

function openSlackApps() {
  window.open('https://api.slack.com/apps', '_blank')
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

.sl-token-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.sl-token-input {
  flex: 1;
  font-family: var(--app-font-family);
  font-size: 12px;
  letter-spacing: 0.02em;
}

.sl-toggle-btn {
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

.sl-toggle-btn:hover {
  background: var(--ui-bg-accented);
  color: var(--ui-text);
}

.sl-app-token-hint {
  font-size: 11px;
  color: var(--ui-text-muted);
  line-height: 1.5;
}

.sl-hint {
  font-size: 11px;
  color: var(--ui-text-muted);
  line-height: 1.5;
}

.sl-hint code {
  font-size: 10px;
  padding: 1px 4px;
  background: var(--ui-bg-accented);
  border-radius: 3px;
}

.sl-link {
  color: var(--color-primary-500);
  text-decoration: none;
}

.sl-link:hover {
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

.sl-user-id {
  font-size: 12px;
  color: var(--color-primary-500);
  font-family: var(--app-font-family);
}

.sl-connect-btn,
.sl-disconnect-btn {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.12s;
  align-self: flex-start;
}

.sl-connect-btn {
  background: #4a154b;
  color: #fff;
}

.sl-disconnect-btn {
  background: var(--color-error-500, #ef4444);
  color: #fff;
}

.sl-connect-btn:disabled,
.sl-disconnect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sl-chat-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.sl-chat-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.sl-chat-list {
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

.sl-chat-item {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 13px;
  max-width: 80%;
  word-break: break-word;
  background: var(--ui-bg-accented);
  color: var(--ui-text);
  align-self: flex-start;
}

.sl-chat-item--me {
  align-self: flex-end;
  background: #4a154b;
  color: #fff;
}

.sl-chat-empty {
  font-size: 12px;
  color: var(--ui-text-muted);
  text-align: center;
  padding: 12px 0;
}

.sl-chat-compose {
  display: flex;
  gap: 6px;
  align-items: center;
}

.sl-chat-send {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  background: #4a154b;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
}

.sl-chat-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sl-error {
  color: var(--color-error-500, #ef4444);
  font-size: 12px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 8%, transparent);
  border-radius: 8px;
}
</style>
