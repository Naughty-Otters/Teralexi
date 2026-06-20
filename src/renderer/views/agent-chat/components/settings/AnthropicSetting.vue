<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.anthropic }}</div>
    <div class="sp-card">
      <div class="sp-field">
        <label class="sp-label">{{ p.fields.apiKey }}</label>
        <input
          class="sp-input sp-key-input"
          type="password"
          :value="agentStore.anthropicApiKey"
          placeholder="sk-ant-…"
          @blur="
            (e) =>
              agentStore.updateAnthropicApiKey(
                (e.target as HTMLInputElement).value,
              )
          "
        />
      </div>
      <div class="sp-field">
        <label class="sp-label">
          {{ p.fields.baseUrl }}
          <span class="sp-label-hint">{{ p.llm.hints.anthropicBaseUrl }}</span>
        </label>
        <input
          class="sp-input"
          :value="agentStore.anthropicBaseURL"
          placeholder="https://api.anthropic.com/v1"
          @blur="
            (e) =>
              agentStore.updateAnthropicBaseURL(
                (e.target as HTMLInputElement).value,
              )
          "
        />
      </div>
      <div class="sp-status-row">
        <span
          class="connection-dot"
          :class="
            agentStore.anthropicApiKey
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
  agentStore.anthropicApiKey
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
