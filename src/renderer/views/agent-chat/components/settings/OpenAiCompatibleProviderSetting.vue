<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ meta.label }}</div>
    <div class="sp-card">
      <div class="sp-field">
        <label class="sp-label">{{ p.fields.apiKey }}</label>
        <input
          class="sp-input sp-key-input"
          type="password"
          :value="apiKey"
          placeholder="API key…"
          @blur="onApiKeyBlur"
        />
      </div>
      <div class="sp-field">
        <label class="sp-label">
          {{ p.fields.baseUrl }}
          <span class="sp-label-hint">{{ p.llm.hints.openaiCompatibleBaseUrl }}</span>
        </label>
        <input
          class="sp-input"
          :value="baseUrl"
          :placeholder="meta.defaultBaseUrl"
          @blur="onBaseUrlBlur"
        />
      </div>
      <div class="sp-status-row">
        <span
          class="connection-dot"
          :class="apiKey ? 'connection-dot--ok' : 'connection-dot--idle'"
        />
        <span class="sp-status-label">{{ apiKeyStatus }}</span>
      </div>
      <p class="sp-hint">{{ meta.hint }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import {
  openAiCompatibleProviderMeta,
  type OpenAiCompatibleProviderId,
} from '@shared/agent/llm-provider-registry'
import { useAgentStore } from '@store/agent'
import './sp-shared.css'

const props = defineProps<{
  provider: OpenAiCompatibleProviderId
}>()

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)
const agentStore = useAgentStore()
const meta = computed(() => openAiCompatibleProviderMeta(props.provider))
const apiKey = computed(() => agentStore.getOpenAiCompatibleApiKey(props.provider))
const baseUrl = computed(() => agentStore.getOpenAiCompatibleBaseUrl(props.provider))

const apiKeyStatus = computed(() =>
  apiKey.value ? p.value.status.apiKeyConfigured : p.value.status.noApiKey,
)

function onApiKeyBlur(event: Event) {
  const value = (event.target as HTMLInputElement).value
  agentStore.updateOpenAiCompatibleApiKey(props.provider, value)
  void agentStore.fetchModelsForProvider(props.provider)
}

function onBaseUrlBlur(event: Event) {
  agentStore.updateOpenAiCompatibleBaseUrl(
    props.provider,
    (event.target as HTMLInputElement).value,
  )
}
</script>

<style scoped>
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
.sp-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--ui-text-muted);
  line-height: 1.45;
}
</style>
