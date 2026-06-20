<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.deepseek }}</div>
    <div class="sp-card">
      <div class="sp-field">
        <label class="sp-label">{{ p.fields.apiKey }}</label>
        <input
          class="sp-input sp-key-input"
          type="password"
          :value="agentStore.deepseekApiKey"
          placeholder="sk-…"
          @blur="
            (e) => {
              agentStore.updateDeepSeekApiKey(
                (e.target as HTMLInputElement).value,
              )
              agentStore.fetchModelsForProvider('deepseek')
            }
          "
        />
      </div>
      <div class="sp-field">
        <label class="sp-label">
          {{ p.fields.baseUrl }}
          <span class="sp-label-hint">{{ p.llm.hints.deepseekBaseUrl }}</span>
        </label>
        <input
          class="sp-input"
          :value="agentStore.deepseekApiUrl"
          placeholder="https://api.deepseek.com/v1"
          @blur="
            (e) =>
              agentStore.updateDeepSeekApiUrl(
                (e.target as HTMLInputElement).value,
              )
          "
        />
      </div>
      <div class="sp-status-row">
        <span
          class="connection-dot"
          :class="
            agentStore.deepseekApiKey
              ? 'connection-dot--ok'
              : 'connection-dot--idle'
          "
        />
        <span class="sp-status-label">{{ apiKeyStatus }}</span>
      </div>
      <p class="sp-hint">
        Uses <code>@ai-sdk/deepseek</code> with models such as
        <code>deepseek-v4-pro</code> and <code>deepseek-v4-flash</code>.
      </p>
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
  agentStore.deepseekApiKey
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
.sp-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--ui-text-muted);
  line-height: 1.45;
}
</style>
