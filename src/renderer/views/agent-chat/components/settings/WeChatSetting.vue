<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.wechat }}</div>
    <div class="sp-card">
      <div class="sp-field">
        <label class="sp-label">{{ p.fields.botName }}</label>
        <input
          class="sp-input"
          :value="state.botName"
          placeholder="Teralexi WeChat Bot"
          @blur="saveBotName"
        />
      </div>

      <div class="sp-field">
        <label class="sp-label">{{ p.fields.corpId }}</label>
        <input
          class="sp-input wc-mono"
          :value="corpIdInput"
          placeholder="ww1234abcd5678ef"
          autocomplete="off"
          spellcheck="false"
          @input="onCorpIdInput"
        />
      </div>

      <div class="sp-field">
        <label class="sp-label">{{ p.fields.corpSecret }}</label>
        <div class="wc-secret-row">
          <input
            class="sp-input wc-mono"
            :type="showSecret ? 'text' : 'password'"
            :value="corpSecretInput"
            placeholder="Enter your corp secret"
            autocomplete="off"
            spellcheck="false"
            @input="onCorpSecretInput"
          />
          <button
            class="wc-toggle-btn"
            type="button"
            :title="showSecret ? p.actions.hideToken : p.actions.showToken"
            @click="showSecret = !showSecret"
          >
            <UIcon :name="showSecret ? 'i-lucide-eye-off' : 'i-lucide-eye'" />
          </button>
        </div>
      </div>

      <div class="sp-field">
        <label class="sp-label">{{ p.fields.wechatAgentId }}</label>
        <input
          class="sp-input wc-mono"
          :value="agentIdInput"
          placeholder="1000002"
          autocomplete="off"
          spellcheck="false"
          @input="onAgentIdInput"
        />
      </div>

      <div class="wc-hint">
        Configure a self-built app in the
        <a
          href="#"
          class="wc-link"
          @click.prevent="openWorkConsole"
        >WeChat Work Admin Console</a>.
        Copy the Corp ID, App Secret, and Agent ID from the app settings.
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
      </div>

      <button
        v-if="state.status !== 'connected'"
        class="wc-connect-btn"
        :disabled="loading || !canConnect"
        @click="saveCredentials"
      >
        {{ loading ? p.status.connecting : p.actions.connectBot }}
      </button>

      <button
        v-if="state.status === 'connected'"
        class="wc-disconnect-btn"
        :disabled="loading"
        @click="stopBot"
      >
        {{ loading ? p.status.processing : p.actions.disconnectBot }}
      </button>

      <div v-if="state.status === 'connected'" class="wc-chat-panel">
        <div class="wc-chat-title">{{ p.channels.miniChat }}</div>
        <div class="wc-chat-list">
          <div
            v-for="msg in chatMessages"
            :key="msg.id"
            class="wc-chat-item"
            :class="{ 'wc-chat-item--me': msg.fromMe }"
          >
            {{ msg.text }}
          </div>
          <div v-if="chatMessages.length === 0" class="wc-chat-empty">
            {{ p.channels.noMessagesYet }}
          </div>
        </div>
        <div class="wc-chat-compose">
          <input
            v-model="chatUserId"
            class="sp-input"
            placeholder="User ID"
            style="max-width: 160px"
          />
          <input
            v-model="chatText"
            class="sp-input"
            :placeholder="p.channels.typeMessage"
            :disabled="loading || !chatUserId.trim()"
            @keydown.enter.prevent="sendChatMessage"
          />
          <button
            class="wc-chat-send"
            :disabled="loading || !chatUserId.trim() || !chatText.trim()"
            @click="sendChatMessage"
          >
            {{ p.actions.send }}
          </button>
        </div>
      </div>

      <div v-if="state.lastError" class="wc-error">{{ state.lastError }}</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)

type WeChatState = {
  botName: string
  corpId: string
  agentId: string
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
  lastError: string | null
}

type WeChatChatMessage = {
  id: string
  text: string
  fromMe: boolean
  timestamp: number
}

const state = ref<WeChatState>({
  botName: 'Teralexi WeChat Bot',
  corpId: '',
  agentId: '',
  status: 'idle',
  lastError: null,
})

const loading = ref(false)
const showSecret = ref(false)
const corpIdInput = ref('')
const corpSecretInput = ref('')
const agentIdInput = ref('')
const chatUserId = ref('')
const chatText = ref('')
const chatMessages = ref<WeChatChatMessage[]>([])
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
  return corpIdInput.value.trim() && corpSecretInput.value.trim()
})

async function loadState() {
  const channel = window.ipcRendererChannel?.GetWeChatState
  if (!channel?.invoke) return
  try {
    loading.value = true
    const result = (await channel.invoke()) as WeChatState
    state.value = result
    corpIdInput.value = result.corpId
    agentIdInput.value = result.agentId
  } finally {
    loading.value = false
  }
}

async function saveBotName(event: Event) {
  const input = event.target as HTMLInputElement
  const channel = window.ipcRendererChannel?.SetWeChatBotName
  if (!channel?.invoke) return
  const result = (await channel.invoke({
    botName: input.value,
  })) as WeChatState
  state.value = result
}

function onCorpIdInput(event: Event) {
  corpIdInput.value = (event.target as HTMLInputElement).value
}

function onCorpSecretInput(event: Event) {
  corpSecretInput.value = (event.target as HTMLInputElement).value
}

function onAgentIdInput(event: Event) {
  agentIdInput.value = (event.target as HTMLInputElement).value
}

async function saveCredentials() {
  const channel = window.ipcRendererChannel?.SetWeChatCredentials
  if (!channel?.invoke) return
  try {
    loading.value = true
    const result = (await channel.invoke({
      corpId: corpIdInput.value,
      corpSecret: corpSecretInput.value,
      agentId: agentIdInput.value,
    })) as WeChatState
    state.value = result
    if (result.status === 'connected') {
      await pollChatMessages()
      startPolling()
    }
  } finally {
    loading.value = false
  }
}

async function stopBot() {
  const channel = window.ipcRendererChannel?.StopWeChatBot
  if (!channel?.invoke) return
  try {
    loading.value = true
    const result = (await channel.invoke()) as WeChatState
    state.value = result
    stopPolling()
  } finally {
    loading.value = false
  }
}

async function pollChatMessages() {
  const channel = window.ipcRendererChannel?.GetWeChatChatMessages
  if (!channel?.invoke) return
  try {
    chatMessages.value = (await channel.invoke()) as WeChatChatMessage[]
  } catch {
    // Ignore poll errors
  }
}

async function sendChatMessage() {
  const text = chatText.value.trim()
  const userId = chatUserId.value.trim()
  if (!text || !userId) return
  const channel = window.ipcRendererChannel?.SendWeChatChatMessage
  if (!channel?.invoke) return
  try {
    loading.value = true
    chatMessages.value = (await channel.invoke({
      userId,
      text,
    })) as WeChatChatMessage[]
    chatText.value = ''
  } finally {
    loading.value = false
  }
}

function openWorkConsole() {
  window.open('https://work.weixin.qq.com/wework_admin/frame', '_blank')
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

.wc-mono {
  font-family: var(--app-font-family);
  font-size: 12px;
  letter-spacing: 0.02em;
}

.wc-secret-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.wc-secret-row .sp-input {
  flex: 1;
  font-family: var(--app-font-family);
  font-size: 12px;
}

.wc-toggle-btn {
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

.wc-toggle-btn:hover {
  background: var(--ui-bg-accented);
  color: var(--ui-text);
}

.wc-hint {
  font-size: 11px;
  color: var(--ui-text-muted);
  line-height: 1.5;
}

.wc-link {
  color: var(--color-primary-500);
  text-decoration: none;
}

.wc-link:hover {
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

.wc-connect-btn,
.wc-disconnect-btn {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.12s;
  align-self: flex-start;
}

.wc-connect-btn {
  background: #07c160;
  color: #fff;
}

.wc-disconnect-btn {
  background: var(--color-error-500, #ef4444);
  color: #fff;
}

.wc-connect-btn:disabled,
.wc-disconnect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wc-chat-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.wc-chat-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.wc-chat-list {
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

.wc-chat-item {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 13px;
  max-width: 80%;
  word-break: break-word;
  background: var(--ui-bg-accented);
  color: var(--ui-text);
  align-self: flex-start;
}

.wc-chat-item--me {
  align-self: flex-end;
  background: #07c160;
  color: #fff;
}

.wc-chat-empty {
  font-size: 12px;
  color: var(--ui-text-muted);
  text-align: center;
  padding: 12px 0;
}

.wc-chat-compose {
  display: flex;
  gap: 6px;
  align-items: center;
}

.wc-chat-send {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  background: #07c160;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
}

.wc-chat-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wc-error {
  color: var(--color-error-500, #ef4444);
  font-size: 12px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 8%, transparent);
  border-radius: 8px;
}
</style>
