<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.llamacpp }}</div>
    <div class="sp-card">
      <div class="sp-field">
        <label class="sp-label">{{ p.llm.llamacppApiUrl }}</label>
        <div class="sp-url-row">
          <input
            class="sp-input"
            :value="agentStore.llamacppBaseURL"
            placeholder="http://127.0.0.1:8080/v1"
            @blur="
              (e) => {
                agentStore.updateLlamaCppURL((e.target as HTMLInputElement).value)
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
        <p class="sp-hint">{{ p.llm.llamacppHint }}</p>
      </div>
      <div class="sp-field">
        <label class="sp-label">{{ p.llm.hints.llamacppApiKey }}</label>
        <input
          class="sp-input"
          type="password"
          :value="agentStore.llamacppApiKey"
          placeholder="Only if server was started with --api-key"
          autocomplete="off"
          @blur="
            (e) =>
              agentStore.updateLlamaCppApiKey(
                (e.target as HTMLInputElement).value,
              )
          "
        />
      </div>
      <div class="sp-status-row">
        <span
          class="connection-dot"
          :class="{
            'connection-dot--ok': agentStore.llamacppConnectionStatus === 'connected',
            'connection-dot--err': agentStore.llamacppConnectionStatus === 'error',
            'connection-dot--idle': agentStore.llamacppConnectionStatus === 'unknown',
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
  if (agentStore.llamacppConnectionStatus === 'connected') {
    return p.value.status.connected
  }
  if (agentStore.llamacppConnectionStatus === 'error') {
    return p.value.llm.llamacppUnreachable
  }
  return p.value.status.notChecked
})

async function checkConn() {
  checking.value = true
  await agentStore.checkLlamaCppConnection()
  await agentStore.fetchModelsForProvider('llamacpp')
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
.sp-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--ui-text-muted);
}
.sp-hint code {
  font-size: 11px;
}
</style>
