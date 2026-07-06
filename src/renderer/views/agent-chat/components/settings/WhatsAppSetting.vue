<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.whatsapp }}</div>
    <div class="sp-card">
      <div class="sp-field">
        <label class="sp-label">{{ p.fields.botName }}</label>
        <input
          class="sp-input"
          :value="state.botName"
          placeholder="Teralexi WhatsApp Bot"
          @blur="saveBotName"
        />
      </div>

      <div class="sp-field">
        <label class="sp-label">{{ p.fields.targetPhone }}</label>
        <div class="wa-phone-row">
          <select
            class="wa-country-select"
            v-model="selectedCountryCode"
            @change="onCountryChange"
          >
            <option v-for="c in COUNTRIES" :key="c.code" :value="c.code">
              {{ c.flag }} +{{ c.dial }}
            </option>
          </select>
          <input
            class="sp-input wa-phone-input"
            :value="localPhoneDisplay"
            type="tel"
            inputmode="numeric"
            autocomplete="tel-national"
            spellcheck="false"
            :placeholder="selectedCountry.placeholder"
            @input="onLocalPhoneInput"
            @blur="saveTargetPhone"
          />
        </div>
        <div
          v-if="localPhoneDisplay"
          class="wa-phone-validation"
          :class="phoneValidation.valid ? 'wa-phone-valid' : 'wa-phone-invalid'"
        >
          <UIcon
            :name="
              phoneValidation.valid
                ? 'i-lucide-check-circle-2'
                : 'i-lucide-alert-circle'
            "
            class="wa-phone-validation-icon"
          />
          <span>
            {{
              phoneValidation.valid
                ? phoneValidation.formatted
                : phoneValidation.message
            }}
          </span>
        </div>
        <div class="wa-phone-hint">
          Phone number this bot will message. Must be WhatsApp-enabled.
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
      </div>

      <div v-if="state.qrCodeDataUrl" class="wa-qr-card">
        <img
          class="wa-qr-image"
          :src="state.qrCodeDataUrl"
          alt="WhatsApp QR code"
        />
      </div>

      <button class="wa-refresh-btn" :disabled="loading" @click="refreshQrCode">
        {{ loading ? p.status.connecting : p.actions.connectBot }}
      </button>

      <button
        v-if="state.status === 'connected'"
        class="wa-logout-btn"
        :disabled="loading"
        @click="logoutSession"
      >
        {{ loading ? p.status.processing : p.actions.disconnectBot }}
      </button>

      <div v-if="state.status === 'connected'" class="wa-chat-panel">
        <div class="wa-chat-title">{{ p.channels.miniChat }}</div>
        <div class="wa-chat-list">
          <div
            v-for="msg in chatMessages"
            :key="msg.id"
            class="wa-chat-item"
            :class="{ 'wa-chat-item--me': msg.fromMe }"
          >
            {{ msg.text }}
          </div>
          <div v-if="chatMessages.length === 0" class="wa-chat-empty">
            {{ p.channels.noMessagesYet }}
          </div>
        </div>
        <div class="wa-chat-compose">
          <input
            v-model="chatInput"
            class="sp-input"
            :placeholder="p.channels.typeMessage"
            :disabled="loading"
            @keydown.enter.prevent="sendChatMessage"
          />
          <button
            class="wa-chat-send"
            :disabled="loading || !chatInput.trim()"
            @click="sendChatMessage"
          >
            {{ p.actions.send }}
          </button>
        </div>
      </div>

      <div
        v-if="state.lastError"
        :class="isSessionConflictNotice ? 'wa-notice' : 'wa-error'"
      >
        {{ state.lastError }}
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)

const isSessionConflictNotice = computed(() => {
  const message = state.value.lastError?.toLowerCase() ?? ''
  return message.includes('conflict') || message.includes('replaced')
})

type WhatsAppState = {
  botName: string
  targetPhone: string
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
  qrCodeDataUrl: string | null
  lastError: string | null
}

type WhatsAppChatMessage = {
  id: string
  text: string
  fromMe: boolean
  timestamp: number
}

type Country = {
  code: string
  name: string
  dial: string
  flag: string
  placeholder: string
  minDigits: number
  maxDigits: number
}

const COUNTRIES: Country[] = [
  {
    code: 'US',
    name: 'United States',
    dial: '1',
    flag: '🇺🇸',
    placeholder: '555 123 4567',
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: 'CA',
    name: 'Canada',
    dial: '1',
    flag: '🇨🇦',
    placeholder: '555 123 4567',
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    dial: '44',
    flag: '🇬🇧',
    placeholder: '7700 900123',
    minDigits: 9,
    maxDigits: 10,
  },
  {
    code: 'AU',
    name: 'Australia',
    dial: '61',
    flag: '🇦🇺',
    placeholder: '412 345 678',
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: 'CN',
    name: 'China',
    dial: '86',
    flag: '🇨🇳',
    placeholder: '132 1234 5678',
    minDigits: 11,
    maxDigits: 11,
  },
  {
    code: 'IN',
    name: 'India',
    dial: '91',
    flag: '🇮🇳',
    placeholder: '98765 43210',
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: 'JP',
    name: 'Japan',
    dial: '81',
    flag: '🇯🇵',
    placeholder: '90 1234 5678',
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: 'KR',
    name: 'South Korea',
    dial: '82',
    flag: '🇰🇷',
    placeholder: '10 1234 5678',
    minDigits: 9,
    maxDigits: 10,
  },
  {
    code: 'HK',
    name: 'Hong Kong',
    dial: '852',
    flag: '🇭🇰',
    placeholder: '6123 4567',
    minDigits: 8,
    maxDigits: 8,
  },
  {
    code: 'TW',
    name: 'Taiwan',
    dial: '886',
    flag: '🇹🇼',
    placeholder: '912 345 678',
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: 'SG',
    name: 'Singapore',
    dial: '65',
    flag: '🇸🇬',
    placeholder: '8123 4567',
    minDigits: 8,
    maxDigits: 8,
  },
  {
    code: 'MY',
    name: 'Malaysia',
    dial: '60',
    flag: '🇲🇾',
    placeholder: '12 345 6789',
    minDigits: 9,
    maxDigits: 10,
  },
  {
    code: 'ID',
    name: 'Indonesia',
    dial: '62',
    flag: '🇮🇩',
    placeholder: '812 3456 789',
    minDigits: 9,
    maxDigits: 12,
  },
  {
    code: 'TH',
    name: 'Thailand',
    dial: '66',
    flag: '🇹🇭',
    placeholder: '81 234 5678',
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: 'PH',
    name: 'Philippines',
    dial: '63',
    flag: '🇵🇭',
    placeholder: '912 345 6789',
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: 'VN',
    name: 'Vietnam',
    dial: '84',
    flag: '🇻🇳',
    placeholder: '91 234 5678',
    minDigits: 9,
    maxDigits: 10,
  },
  {
    code: 'PK',
    name: 'Pakistan',
    dial: '92',
    flag: '🇵🇰',
    placeholder: '301 2345678',
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: 'BD',
    name: 'Bangladesh',
    dial: '880',
    flag: '🇧🇩',
    placeholder: '1712 345678',
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: 'DE',
    name: 'Germany',
    dial: '49',
    flag: '🇩🇪',
    placeholder: '1512 345 6789',
    minDigits: 10,
    maxDigits: 11,
  },
  {
    code: 'FR',
    name: 'France',
    dial: '33',
    flag: '🇫🇷',
    placeholder: '6 12 34 56 78',
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: 'IT',
    name: 'Italy',
    dial: '39',
    flag: '🇮🇹',
    placeholder: '312 345 6789',
    minDigits: 9,
    maxDigits: 10,
  },
  {
    code: 'ES',
    name: 'Spain',
    dial: '34',
    flag: '🇪🇸',
    placeholder: '612 345 678',
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: 'NL',
    name: 'Netherlands',
    dial: '31',
    flag: '🇳🇱',
    placeholder: '6 1234 5678',
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: 'RU',
    name: 'Russia',
    dial: '7',
    flag: '🇷🇺',
    placeholder: '912 345 6789',
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: 'TR',
    name: 'Turkey',
    dial: '90',
    flag: '🇹🇷',
    placeholder: '532 123 4567',
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: 'SA',
    name: 'Saudi Arabia',
    dial: '966',
    flag: '🇸🇦',
    placeholder: '51 234 5678',
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: 'AE',
    name: 'UAE',
    dial: '971',
    flag: '🇦🇪',
    placeholder: '50 123 4567',
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: 'IL',
    name: 'Israel',
    dial: '972',
    flag: '🇮🇱',
    placeholder: '52 123 4567',
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: 'EG',
    name: 'Egypt',
    dial: '20',
    flag: '🇪🇬',
    placeholder: '100 123 4567',
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: 'NG',
    name: 'Nigeria',
    dial: '234',
    flag: '🇳🇬',
    placeholder: '802 345 6789',
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: 'ZA',
    name: 'South Africa',
    dial: '27',
    flag: '🇿🇦',
    placeholder: '71 234 5678',
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: 'BR',
    name: 'Brazil',
    dial: '55',
    flag: '🇧🇷',
    placeholder: '11 91234 5678',
    minDigits: 10,
    maxDigits: 11,
  },
  {
    code: 'MX',
    name: 'Mexico',
    dial: '52',
    flag: '🇲🇽',
    placeholder: '55 1234 5678',
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: 'AR',
    name: 'Argentina',
    dial: '54',
    flag: '🇦🇷',
    placeholder: '9 11 1234 5678',
    minDigits: 10,
    maxDigits: 11,
  },
  {
    code: 'CO',
    name: 'Colombia',
    dial: '57',
    flag: '🇨🇴',
    placeholder: '312 345 6789',
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: 'UA',
    name: 'Ukraine',
    dial: '380',
    flag: '🇺🇦',
    placeholder: '67 123 4567',
    minDigits: 9,
    maxDigits: 9,
  },
]

const selectedCountryCode = ref('US')
const localPhoneRaw = ref('')
const localPhoneDisplay = ref('')

const state = ref<WhatsAppState>({
  botName: 'Teralexi WhatsApp Bot',
  targetPhone: '',
  status: 'idle',
  qrCodeDataUrl: null,
  lastError: null,
})
const loading = ref(false)
const chatInput = ref('')
const chatMessages = ref<WhatsAppChatMessage[]>([])
let chatPollTimer: ReturnType<typeof setInterval> | null = null

const statusText = computed(() => {
  if (state.value.status === 'connected') return p.value.status.connected
  if (state.value.status === 'connecting') return p.value.status.connecting
  if (state.value.status === 'error') return p.value.status.error
  if (state.value.status === 'disconnected') return p.value.status.disconnected
  return p.value.status.idle
})

const selectedCountry = computed(
  () =>
    COUNTRIES.find((c) => c.code === selectedCountryCode.value) ?? COUNTRIES[0],
)

const phoneValidation = computed(() => {
  const digits = localPhoneRaw.value
  if (!digits) return { valid: false, message: '', formatted: '' }
  const country = selectedCountry.value
  if (digits.length < country.minDigits) {
    return {
      valid: false,
      message: `Too short — need ${country.minDigits} digits, have ${digits.length}`,
      formatted: '',
    }
  }
  if (digits.length > country.maxDigits) {
    return {
      valid: false,
      message: `Too long — max ${country.maxDigits} digits`,
      formatted: '',
    }
  }
  return {
    valid: true,
    message: '',
    formatted: `+${country.dial} ${formatForInput(digits, country.code)}`,
  }
})

onMounted(async () => {
  await loadState()
  parseStoredPhone(state.value.targetPhone)
  if (state.value.status === 'connected') {
    await loadChatMessages()
    startChatPolling()
  } else if (state.value.status !== 'error') {
    // Channel is auto-starting in the background; poll until we get a QR or connection
    void pollLatestState()
  }
})

onUnmounted(() => {
  stopChatPolling()
})

watch(
  () => state.value.status,
  async (status) => {
    if (status === 'connected') {
      await loadChatMessages()
      startChatPolling()
      return
    }
    stopChatPolling()
    chatMessages.value = []
  },
)

async function loadState() {
  const next = await window.ipcRendererChannel?.GetWhatsAppState?.invoke()
  if (next) {
    state.value = next
  }
}

async function saveBotName(event: Event) {
  const botName = (event.target as HTMLInputElement).value
  const next = await window.ipcRendererChannel?.SetWhatsAppBotName?.invoke({
    botName,
  })
  if (next) {
    state.value = next
  }
}

async function saveTargetPhone() {
  const digits = localPhoneRaw.value
  if (!digits || !phoneValidation.value.valid) return false
  const targetPhone = `+${selectedCountry.value.dial}${digits}`
  const next = await window.ipcRendererChannel?.SetWhatsAppTargetPhone?.invoke({
    targetPhone,
  })
  if (next) {
    state.value = next
    return true
  }
  return false
}

function onLocalPhoneInput(event: Event) {
  const input = event.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '')
  localPhoneRaw.value = digits
  const formatted = formatForInput(digits, selectedCountry.value.code)
  localPhoneDisplay.value = formatted
  input.value = formatted
}

function onCountryChange() {
  if (localPhoneRaw.value) {
    localPhoneDisplay.value = formatForInput(
      localPhoneRaw.value,
      selectedCountry.value.code,
    )
  }
}

function formatForInput(digits: string, countryCode: string): string {
  switch (countryCode) {
    case 'US':
    case 'CA': {
      const d = digits.slice(0, 10)
      if (d.length <= 3) return d
      if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`
      return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
    }
    case 'CN': {
      const d = digits.slice(0, 11)
      if (d.length <= 3) return d
      if (d.length <= 7) return `${d.slice(0, 3)} ${d.slice(3)}`
      return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`
    }
    case 'GB': {
      const d = digits.slice(0, 10)
      if (d.length <= 4) return d
      return `${d.slice(0, 4)} ${d.slice(4)}`
    }
    case 'IN': {
      const d = digits.slice(0, 10)
      if (d.length <= 5) return d
      return `${d.slice(0, 5)} ${d.slice(5)}`
    }
    default: {
      const d = digits.slice(0, 15)
      if (d.length <= 4) return d
      if (d.length <= 8) return `${d.slice(0, 4)} ${d.slice(4)}`
      return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8)}`
    }
  }
}

function parseStoredPhone(phone: string) {
  if (!phone) return
  let digits = phone
  if (phone.includes('@')) {
    digits = phone.split('@')[0]
  }
  digits = digits.replace(/\D/g, '')
  if (!digits) return
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
  for (const country of sorted) {
    if (digits.startsWith(country.dial)) {
      selectedCountryCode.value = country.code
      const local = digits.slice(country.dial.length)
      localPhoneRaw.value = local
      localPhoneDisplay.value = formatForInput(local, country.code)
      return
    }
  }
  localPhoneRaw.value = digits
  localPhoneDisplay.value = digits
}

async function refreshQrCode() {
  loading.value = true
  try {
    const next =
      await window.ipcRendererChannel?.RefreshWhatsAppQrCode?.invoke()
    if (next) {
      state.value = next
    }
    if (
      !state.value.qrCodeDataUrl &&
      (state.value.status === 'idle' ||
        state.value.status === 'connecting' ||
        state.value.status === 'disconnected')
    ) {
      await pollLatestState()
    }
  } finally {
    loading.value = false
  }
}

async function logoutSession() {
  loading.value = true
  try {
    const next =
      await window.ipcRendererChannel?.LogoutWhatsAppSession?.invoke()
    if (next) {
      state.value = next
    }
    chatInput.value = ''
    chatMessages.value = []
  } finally {
    loading.value = false
  }
}

async function loadChatMessages() {
  const next =
    await window.ipcRendererChannel?.GetWhatsAppChatMessages?.invoke()
  if (next) {
    chatMessages.value = next
  }
}

function startChatPolling() {
  if (chatPollTimer) return
  chatPollTimer = setInterval(() => {
    void loadChatMessages()
  }, 2000)
}

function stopChatPolling() {
  if (!chatPollTimer) return
  clearInterval(chatPollTimer)
  chatPollTimer = null
}

async function sendChatMessage() {
  const text = chatInput.value.trim()
  if (!text) return
  if (!phoneValidation.value.valid) {
    state.value.lastError =
      'Please enter a valid target phone number before sending.'
    return
  }
  const saved = await saveTargetPhone()
  if (!saved) {
    state.value.lastError = 'Unable to save target phone number. Try again.'
    return
  }
  loading.value = true
  try {
    state.value.lastError = null
    const next =
      await window.ipcRendererChannel?.SendWhatsAppChatMessage?.invoke({
        text,
      })
    if (next) {
      chatMessages.value = next
    }
    chatInput.value = ''
  } catch (error) {
    state.value.lastError =
      error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

async function pollLatestState(timeoutMs = 12000, intervalMs = 500) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const next = await window.ipcRendererChannel?.GetWhatsAppState?.invoke()
    if (next) {
      state.value = next
    }
    if (state.value.qrCodeDataUrl || state.value.status !== 'connecting') {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
</script>

<style scoped>
@import './sp-shared.css';

.sp-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sp-section-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--ui-border);
}

.wa-qr-card {
  border: 1px dashed var(--ui-border);
  border-radius: 10px;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ui-bg);
  padding: 12px;
}

.wa-qr-image {
  width: 200px;
  height: 200px;
  object-fit: contain;
}

.wa-qr-placeholder {
  font-size: 12px;
  color: var(--ui-text-muted);
  text-align: center;
  line-height: 1.5;
}

.wa-refresh-btn {
  width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
  padding: 9px 12px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}

.wa-logout-btn {
  width: 100%;
  border: 1px solid
    color-mix(in srgb, var(--color-error-500, #ef4444) 30%, transparent);
  border-radius: 8px;
  background: color-mix(
    in srgb,
    var(--color-error-500, #ef4444) 8%,
    transparent
  );
  color: var(--color-error-500, #ef4444);
  padding: 9px 12px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}

.wa-logout-btn:hover:not(:disabled) {
  border-color: color-mix(
    in srgb,
    var(--color-error-500, #ef4444) 45%,
    transparent
  );
  background: color-mix(
    in srgb,
    var(--color-error-500, #ef4444) 14%,
    transparent
  );
}

.wa-logout-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.wa-refresh-btn:hover:not(:disabled) {
  border-color: var(--color-primary-500);
}

.wa-refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.wa-error {
  font-size: 12px;
  color: var(--color-error-500, #ef4444);
  background: color-mix(
    in srgb,
    var(--color-error-500, #ef4444) 10%,
    transparent
  );
  border: 1px solid
    color-mix(in srgb, var(--color-error-500, #ef4444) 30%, transparent);
  border-radius: 6px;
  padding: 8px 10px;
  word-break: break-word;
}

.wa-notice {
  font-size: 12px;
  color: var(--color-warning-600, #d97706);
  background: color-mix(
    in srgb,
    var(--color-warning-500, #f59e0b) 10%,
    transparent
  );
  border: 1px solid
    color-mix(in srgb, var(--color-warning-500, #f59e0b) 30%, transparent);
  border-radius: 6px;
  padding: 8px 10px;
  word-break: break-word;
}

.wa-chat-panel {
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  padding: 10px;
  background: var(--ui-bg);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wa-chat-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text);
}

.wa-chat-list {
  max-height: 170px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 2px;
}

.wa-chat-item {
  padding: 7px 9px;
  border-radius: 8px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
  font-size: 12px;
  line-height: 1.45;
  max-width: 85%;
  word-break: break-word;
}

.wa-chat-item--me {
  align-self: flex-end;
  background: color-mix(
    in srgb,
    var(--color-primary-500) 16%,
    var(--ui-bg-elevated)
  );
  border: 1px solid
    color-mix(in srgb, var(--color-primary-500) 30%, transparent);
}

.wa-chat-empty {
  font-size: 12px;
  color: var(--ui-text-muted);
  text-align: center;
  padding: 8px;
}

.wa-chat-compose {
  display: flex;
  gap: 6px;
}

.wa-chat-send {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 0 12px;
  font-size: 12px;
  font-family: inherit;
  color: var(--ui-text);
  background: var(--ui-bg-elevated);
  cursor: pointer;
}

.wa-chat-send:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.wa-phone-row {
  display: flex;
  gap: 6px;
  align-items: stretch;
}

.wa-country-select {
  flex-shrink: 0;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
}

.wa-country-select:focus {
  border-color: var(--color-primary-500);
}

.wa-phone-input {
  flex: 1;
  font-variant-numeric: tabular-nums;
}

.wa-phone-validation {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  padding: 4px 2px;
  font-variant-numeric: tabular-nums;
}

.wa-phone-validation-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

.wa-phone-valid {
  color: var(--color-success-500, #22c55e);
}

.wa-phone-invalid {
  color: var(--color-error-500, #ef4444);
}

.wa-phone-hint {
  font-size: 11px;
  color: var(--ui-text-muted);
  line-height: 1.45;
}
</style>
