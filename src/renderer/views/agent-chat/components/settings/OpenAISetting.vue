<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.openai }}</div>
    <div class="sp-card">
      <div class="sp-field">
        <label class="sp-label">{{ p.fields.apiKey }}</label>
        <input
          class="sp-input sp-key-input"
          type="password"
          :value="agentStore.openaiApiKey"
          placeholder="sk-…"
          @blur="
            (e) => {
              agentStore.updateOpenAIApiKey(
                (e.target as HTMLInputElement).value,
              )
              agentStore.fetchModelsForProvider('openai')
            }
          "
        />
      </div>
      <div class="sp-field">
        <label class="sp-label">
          {{ p.fields.baseUrl }}
          <span class="sp-label-hint">{{ p.llm.hints.openaiBaseUrl }}</span>
        </label>
        <input
          class="sp-input"
          :value="agentStore.openaiBaseURL"
          placeholder="https://api.openai.com/v1"
          @blur="
            (e) =>
              agentStore.updateOpenAIBaseURL(
                (e.target as HTMLInputElement).value,
              )
          "
        />
      </div>
      <div class="sp-status-row">
        <span
          class="connection-dot"
          :class="
            agentStore.openaiApiKey
              ? 'connection-dot--ok'
              : 'connection-dot--idle'
          "
        />
        <span class="sp-status-label">{{ apiKeyStatus }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useAgentStore } from '@store/agent'
import './sp-shared.css'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)
const agentStore = useAgentStore()

const apiKeyStatus = computed(() =>
  agentStore.openaiApiKey
    ? p.value.status.apiKeyConfigured
    : p.value.status.noApiKey,
)
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
</style>
