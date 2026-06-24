<template>
  <div class="llm-setup-card">
    <p v-if="guideIntro" class="llm-setup-intro">{{ guideIntro }}</p>

    <div v-if="setupSteps.length" class="llm-setup-steps">
      <div class="llm-setup-steps-title">{{ ps.wizard.setupGuide }}</div>
      <ol class="llm-setup-steps-list">
        <li v-for="(step, index) in setupSteps" :key="index">{{ step }}</li>
      </ol>
    </div>

    <div
      v-if="meta.consoleUrl || meta.installUrl || meta.docsUrl"
      class="llm-setup-external-block"
    >
      <p v-if="meta.consoleUrl" class="llm-setup-external-hint">
        {{ ps.wizard.openConsoleHint }}
      </p>
      <p v-else-if="meta.installUrl" class="llm-setup-external-hint">
        {{ ps.wizard.openInstallHint }}
      </p>

      <div class="llm-setup-action-buttons">
        <button
          v-if="meta.consoleUrl"
          type="button"
          class="llm-setup-action-btn"
          :title="meta.consoleUrl"
          @click="openExternalUrl(meta.consoleUrl!)"
        >
          <UIcon name="i-lucide-external-link" class="llm-setup-action-btn-icon" />
          {{ ps.wizard.openConsole }}
        </button>
        <button
          v-else-if="meta.installUrl"
          type="button"
          class="llm-setup-action-btn"
          :title="meta.installUrl"
          @click="openExternalUrl(meta.installUrl!)"
        >
          <UIcon name="i-lucide-download" class="llm-setup-action-btn-icon" />
          {{ ps.wizard.openInstall }}
        </button>
        <button
          v-if="meta.docsUrl"
          type="button"
          class="llm-setup-action-btn"
          :title="meta.docsUrl"
          @click="openExternalUrl(meta.docsUrl!)"
        >
          <UIcon name="i-lucide-book-open" class="llm-setup-action-btn-icon" />
          {{ ps.wizard.openDocs }}
        </button>
      </div>

      <p
        v-if="meta.consoleUrl"
        class="llm-setup-external-url"
      >
        {{ consoleDisplayUrl }}
      </p>
      <p
        v-else-if="meta.installUrl"
        class="llm-setup-external-url"
      >
        {{ installDisplayUrl }}
      </p>
    </div>

    <div class="sp-card llm-setup-form">
      <div class="llm-setup-form-row">
        <div class="llm-setup-form-fields">
          <template v-if="meta.category === 'local' && provider === 'ollama'">
            <div class="sp-field">
              <label class="sp-label">{{ p.fields.serverUrl }}</label>
              <input
                class="sp-input"
                :value="agentStore.ollamaBaseURL"
                placeholder="http://localhost:11434"
                @blur="onOllamaUrlBlur"
              />
            </div>
          </template>

          <template v-else-if="meta.category === 'local' && provider === 'llamacpp'">
            <div class="sp-field">
              <label class="sp-label">{{ p.fields.baseUrl }}</label>
              <input
                class="sp-input"
                :value="agentStore.llamacppBaseURL"
                placeholder="http://127.0.0.1:8080/v1"
                @blur="onLlamaCppUrlBlur"
              />
            </div>
            <div class="sp-field">
              <label class="sp-label">
                {{ p.fields.apiKey }}
                <span class="sp-label-hint">{{ p.fields.optional }}</span>
              </label>
              <input
                class="sp-input sp-key-input"
                type="password"
                :value="agentStore.llamacppApiKey"
                @blur="onLlamaCppKeyBlur"
              />
            </div>
          </template>

          <template v-else>
            <div class="sp-field">
              <label class="sp-label">{{ p.fields.apiKey }}</label>
              <input
                v-model="draftApiKey"
                class="sp-input sp-key-input"
                type="password"
                :placeholder="meta.keyPlaceholder ?? 'API key…'"
              />
            </div>
            <div v-if="showBaseUrl" class="sp-field">
              <label class="sp-label">
                {{ p.fields.baseUrl }}
                <span class="sp-label-hint">{{ baseUrlHint }}</span>
              </label>
              <input
                v-model="draftBaseUrl"
                class="sp-input"
                :placeholder="meta.defaultBaseUrl ?? ''"
              />
            </div>
          </template>
        </div>

        <button
          type="button"
          class="llm-setup-action-btn llm-setup-test-btn"
          :disabled="testing"
          :title="ps.wizard.testAndSave"
          :aria-label="ps.wizard.testAndSave"
          @click="runTest"
        >
          <UIcon
            name="i-lucide-refresh-cw"
            class="llm-setup-test-btn-icon"
            :class="{ 'llm-setup-test-btn-icon--spin': testing }"
          />
        </button>
      </div>

      <div v-if="testMessage" class="llm-setup-status" :class="testStatusClass">
        {{ testMessage }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { openExternalUrl } from '@renderer/lib/open-external-url'
import { providerSetupMeta } from '@shared/agent/provider-setup-guides'
import {
  isOpenAiCompatibleProvider,
  type ProviderType,
} from '@shared/agent/llm-provider-registry'
import { useAgentStore } from '@store/agent'
import './sp-shared.css'

const props = defineProps<{
  provider: ProviderType
}>()

const emit = defineEmits<{
  tested: [{ ok: boolean; modelCount?: number }]
}>()

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)
const ps = computed(() => t.value.providerSetup)
const agentStore = useAgentStore()

const meta = computed(() => providerSetupMeta(props.provider))

function formatExternalLinkLabel(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname !== '/' ? parsed.pathname : ''}`
  } catch {
    return url
  }
}

const consoleDisplayUrl = computed(() =>
  meta.value.consoleUrl ? formatExternalLinkLabel(meta.value.consoleUrl) : '',
)
const installDisplayUrl = computed(() =>
  meta.value.installUrl ? formatExternalLinkLabel(meta.value.installUrl) : '',
)

const guideIntro = computed(
  () => ps.value.providers[props.provider]?.intro ?? '',
)
const setupSteps = computed(
  () => ps.value.providers[props.provider]?.steps ?? [],
)

const draftApiKey = ref('')
const draftBaseUrl = ref('')
const testing = ref(false)
const testOk = ref<boolean | null>(null)
const testMessage = ref('')
const testModelCount = ref<number | undefined>()

const showBaseUrl = computed(
  () => meta.value.category === 'cloud' && Boolean(meta.value.defaultBaseUrl),
)

const baseUrlHint = computed(() => {
  switch (props.provider) {
    case 'openai':
      return p.value.llm.hints.openaiBaseUrl
    case 'anthropic':
      return p.value.llm.hints.anthropicBaseUrl
    case 'deepseek':
      return p.value.llm.hints.deepseekBaseUrl
    case 'gemini':
      return p.value.llm.hints.geminiBaseUrl
    case 'zhipu':
      return p.value.llm.hints.zhipuBaseUrl
    default:
      return isOpenAiCompatibleProvider(props.provider)
        ? p.value.llm.hints.openaiCompatibleBaseUrl
        : ''
  }
})

const testStatusClass = computed(() =>
  testOk.value === true
    ? 'llm-setup-status--ok'
    : testOk.value === false
      ? 'llm-setup-status--err'
      : '',
)

function syncDraftFromStore() {
  const id = props.provider
  if (id === 'openai') {
    draftApiKey.value = agentStore.openaiApiKey
    draftBaseUrl.value = agentStore.openaiBaseURL
  } else if (id === 'anthropic') {
    draftApiKey.value = agentStore.anthropicApiKey
    draftBaseUrl.value = agentStore.anthropicBaseURL
  } else if (id === 'gemini') {
    draftApiKey.value = agentStore.geminiApiKey
    draftBaseUrl.value = agentStore.geminiBaseURL
  } else if (id === 'deepseek') {
    draftApiKey.value = agentStore.deepseekApiKey
    draftBaseUrl.value = agentStore.deepseekApiUrl
  } else if (id === 'zhipu') {
    draftApiKey.value = agentStore.zhipuApiKey
    draftBaseUrl.value = agentStore.zhipuBaseURL
  } else if (isOpenAiCompatibleProvider(id)) {
    draftApiKey.value = agentStore.getOpenAiCompatibleApiKey(id)
    draftBaseUrl.value = agentStore.getOpenAiCompatibleBaseUrl(id)
  }
}

watch(() => props.provider, syncDraftFromStore, { immediate: true })

function persistDraftCredentials() {
  const id = props.provider
  if (id === 'openai') {
    agentStore.updateOpenAIApiKey(draftApiKey.value)
    agentStore.updateOpenAIBaseURL(draftBaseUrl.value)
  } else if (id === 'anthropic') {
    agentStore.updateAnthropicApiKey(draftApiKey.value)
    agentStore.updateAnthropicBaseURL(draftBaseUrl.value)
  } else if (id === 'gemini') {
    agentStore.updateGeminiApiKey(draftApiKey.value)
    agentStore.updateGeminiBaseURL(draftBaseUrl.value)
  } else if (id === 'deepseek') {
    agentStore.updateDeepSeekApiKey(draftApiKey.value)
    agentStore.updateDeepSeekApiUrl(draftBaseUrl.value)
  } else if (id === 'zhipu') {
    agentStore.updateZhipuApiKey(draftApiKey.value)
    agentStore.updateZhipuBaseURL(draftBaseUrl.value)
  } else if (isOpenAiCompatibleProvider(id)) {
    agentStore.updateOpenAiCompatibleApiKey(id, draftApiKey.value)
    agentStore.updateOpenAiCompatibleBaseUrl(id, draftBaseUrl.value)
  }
}

function onOllamaUrlBlur(event: Event) {
  agentStore.updateOllamaURL((event.target as HTMLInputElement).value)
}

function onLlamaCppUrlBlur(event: Event) {
  agentStore.updateLlamaCppURL((event.target as HTMLInputElement).value)
}

function onLlamaCppKeyBlur(event: Event) {
  agentStore.updateLlamaCppApiKey((event.target as HTMLInputElement).value)
}

async function runTest() {
  testing.value = true
  testOk.value = null
  testMessage.value = ''
  try {
    if (meta.value.category === 'cloud') {
      persistDraftCredentials()
    }
    const result = await agentStore.testProviderConnection(props.provider)
    testOk.value = result.ok
    testModelCount.value = result.modelCount
    if (result.ok) {
      const count = result.modelCount ?? 0
      testMessage.value =
        count > 0
          ? `${ps.value.wizard.testSuccess} ${ps.value.wizard.modelsFound.replace('{count}', String(count))}`
          : ps.value.wizard.testSuccess
    } else {
      testMessage.value = result.error ?? ps.value.wizard.testFailed
    }
    emit('tested', { ok: result.ok, modelCount: result.modelCount })
  } finally {
    testing.value = false
  }
}
</script>

<style scoped>
.llm-setup-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.llm-setup-intro {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.llm-setup-steps-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  margin-bottom: 8px;
}

.llm-setup-steps-list {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 13px;
  line-height: 1.55;
  color: var(--ui-text);
}

.llm-setup-steps-list li + li {
  margin-top: 6px;
}

.llm-setup-external-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.llm-setup-external-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
}

.llm-setup-action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.llm-setup-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  border-radius: 8px;
  border: 1.5px solid var(--color-primary-500, #3b82f6);
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  background: color-mix(
    in srgb,
    var(--color-primary-500, #3b82f6) 14%,
    var(--ui-bg, #fff)
  );
  color: var(--color-primary-700, #1d4ed8);
  transition:
    background 0.12s,
    border-color 0.12s,
    color 0.12s,
    box-shadow 0.12s,
    transform 0.1s;
}

.llm-setup-action-btn-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.llm-setup-action-btn:hover {
  background: color-mix(
    in srgb,
    var(--color-primary-500, #3b82f6) 22%,
    var(--ui-bg, #fff)
  );
  border-color: var(--color-primary-600, #2563eb);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--color-primary-500, #3b82f6) 22%, transparent);
}

.llm-setup-action-btn:focus-visible {
  outline: 2px solid var(--color-primary-500, #3b82f6);
  outline-offset: 2px;
}

.llm-setup-action-btn:active {
  transform: translateY(1px);
}

.llm-setup-external-url {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--ui-text-muted);
  word-break: break-all;
}

:global(html.dark) .llm-setup-action-btn {
  color: var(--color-primary-300, #93c5fd);
  border-color: var(--color-primary-400, #60a5fa);
}

:global(html.dark) .llm-setup-action-btn:hover {
  border-color: var(--color-primary-300, #93c5fd);
}

.llm-setup-form {
  margin-top: 4px;
}

.llm-setup-form-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.llm-setup-form-fields {
  flex: 1;
  min-width: 0;
}

.llm-setup-test-btn {
  flex-shrink: 0;
  padding: 7px 10px;
}

.llm-setup-test-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.llm-setup-test-btn-icon {
  width: 16px;
  height: 16px;
}

.llm-setup-test-btn-icon--spin {
  animation: llm-setup-spin 0.85s linear infinite;
}

@keyframes llm-setup-spin {
  to {
    transform: rotate(360deg);
  }
}

.llm-setup-status {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.45;
}

.llm-setup-status--ok {
  color: var(--color-success-600, #16a34a);
}

.llm-setup-status--err {
  color: var(--color-error-600, #dc2626);
}
</style>
