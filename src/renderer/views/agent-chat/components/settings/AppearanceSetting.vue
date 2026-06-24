<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.appearance }}</div>
    <p class="appearance-intro">{{ t.settings.appearance.intro }}</p>

    <div v-if="loading" class="appearance-loading">{{ t.common.loading }}</div>

    <div v-else class="sp-card appearance-card">
      <div class="appearance-row">
        <div class="appearance-row-text">
          <span class="appearance-row-title">{{ t.settings.appearance.modeLabel }}</span>
          <span class="appearance-row-desc">{{ t.settings.appearance.modeHint }}</span>
        </div>
        <select
          class="sp-input sp-select appearance-select"
          :value="draft.appearance"
          :disabled="saving"
          @change="onAppearanceChange"
        >
          <option value="solid">{{ t.settings.appearance.solid }}</option>
          <option value="glass">{{ t.settings.appearance.glass }}</option>
        </select>
      </div>

      <p v-if="glassNativeHint" class="appearance-note">{{ glassNativeHint }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import {
  DEFAULT_APPEARANCE_SETTINGS,
  type AppearanceSettings,
} from '@shared/ui/appearance-settings'
import {
  loadAppearanceSettings,
  saveAppearanceSettings,
} from '@renderer/appearanceSettings'
import './sp-shared.css'

const { t } = useI18n()

const loading = ref(true)
const saving = ref(false)
const draft = reactive({ ...DEFAULT_APPEARANCE_SETTINGS })

const isMac = window.systemInfo?.platform === 'darwin'

const glassNativeHint = computed(() => {
  if (draft.appearance !== 'glass') return ''
  const copy = t.value.settings.appearance
  if (isMac) return copy.macNativeHint
  return copy.nonMacHint
})

async function loadSettings(): Promise<void> {
  loading.value = true
  try {
    const settings = await loadAppearanceSettings()
    draft.appearance = settings.appearance
  } finally {
    loading.value = false
  }
}

async function onAppearanceChange(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value
  const appearance: AppearanceSettings['appearance'] =
    value === 'glass' ? 'glass' : 'solid'
  draft.appearance = appearance
  saving.value = true
  try {
    const next = await saveAppearanceSettings({ appearance })
    draft.appearance = next.appearance
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadSettings()
})
</script>

<style scoped>
.appearance-intro,
.appearance-row-desc {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.appearance-row-desc {
  margin: 0;
}

.appearance-loading {
  font-size: 13px;
  color: var(--ui-text-muted);
}

.appearance-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.appearance-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.appearance-row-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.appearance-row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
}

.appearance-select {
  width: 14rem;
  flex-shrink: 0;
}

.appearance-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
}
</style>
