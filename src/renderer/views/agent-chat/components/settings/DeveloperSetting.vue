<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.developer }}</div>
    <p class="dev-intro">{{ p.developer.intro }}</p>

    <div v-if="loading" class="dev-loading">{{ t.common.loading }}</div>

    <div v-else class="sp-card">
      <div class="dev-row">
        <div class="dev-row-text">
          <span class="dev-row-title">{{ p.developer.llmDebugTitle }}</span>
          <span class="dev-row-desc">{{ p.developer.llmDebugDesc }}</span>
        </div>
        <label
          class="sp-toggle"
          :title="enabled ? p.developer.disableLlmDebug : p.developer.enableLlmDebug"
        >
          <input
            type="checkbox"
            :checked="enabled"
            :disabled="saving"
            @change="onToggle(($event.target as HTMLInputElement).checked)"
          />
          <span
            class="sp-toggle-track"
            :class="{ 'sp-toggle-track--on': enabled }"
          />
        </label>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { DEFAULT_USER_ID } from '@store/agent/config'
import {
  LLM_DEBUG_MODE_PROPERTY_KEY,
  llmDebugModeToString,
  parseLlmDebugMode,
} from '@shared/agent/llm-debug'
import './sp-shared.css'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)
const loading = ref(true)
const saving = ref(false)
const enabled = ref(false)

async function loadSetting(): Promise<void> {
  loading.value = true
  try {
    const channel = window.ipcRendererChannel?.GetUserProperty
    if (!channel?.invoke) {
      enabled.value = false
      return
    }
    const row = await channel.invoke({
      userId: DEFAULT_USER_ID,
      propertyKey: LLM_DEBUG_MODE_PROPERTY_KEY,
    })
    enabled.value = parseLlmDebugMode(row?.propertyValue)
  } finally {
    loading.value = false
  }
}

async function onToggle(next: boolean): Promise<void> {
  saving.value = true
  try {
    const channel = window.ipcRendererChannel?.SetUserProperty
    if (!channel?.invoke) return
    await channel.invoke({
      userId: DEFAULT_USER_ID,
      propertyKey: LLM_DEBUG_MODE_PROPERTY_KEY,
      propertyValue: llmDebugModeToString(next),
    })
    enabled.value = next
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadSetting()
})
</script>

<style scoped>
.dev-intro {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}
.dev-loading {
  font-size: 13px;
  color: var(--ui-text-muted);
}
.dev-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.dev-row-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.dev-row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
}
.dev-row-desc {
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
}
</style>
