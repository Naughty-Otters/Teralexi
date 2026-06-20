<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.ollama }}</div>
    <div class="sp-card">
      <div class="sp-field">
        <label class="sp-label">{{ p.fields.serverUrl }}</label>
        <div class="sp-url-row">
          <input
            class="sp-input"
            :value="agentStore.ollamaBaseURL"
            placeholder="http://localhost:11434"
            @blur="
              (e) => {
                agentStore.updateOllamaURL((e.target as HTMLInputElement).value)
                checkConn()
              }
            "
          />
          <button
            class="icon-btn"
            :class="{ 'icon-btn--spinning': checking }"
            :title="p.actions.checkConnection"
            @click="checkConn"
          >
            ⟳
          </button>
        </div>
      </div>
      <div class="sp-status-row">
        <span
          class="connection-dot"
          :class="{
            'connection-dot--ok': agentStore.connectionStatus === 'connected',
            'connection-dot--err': agentStore.connectionStatus === 'error',
            'connection-dot--idle': agentStore.connectionStatus === 'unknown',
          }"
        />
        <span class="sp-status-label">{{ connectionStatusLabel }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useAgentStore } from '@store/agent'
import './sp-shared.css'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)

const agentStore = useAgentStore()
const checking = ref(false)

const connectionStatusLabel = computed(() => {
  if (agentStore.connectionStatus === 'connected') {
    return p.value.status.connected
  }
  if (agentStore.connectionStatus === 'error') {
    return p.value.llm.ollamaUnreachable
  }
  return p.value.status.notChecked
})

async function checkConn() {
  checking.value = true
  await agentStore.checkConnection()
  await agentStore.fetchModelsForProvider('ollama')
  checking.value = false
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
</style>
