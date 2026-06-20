<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.language }}</div>
    <p class="lang-intro">{{ t.settings.language.intro }}</p>

    <div v-if="loading" class="lang-loading">{{ t.common.loading }}</div>

    <div v-else class="sp-card lang-card">
      <div class="lang-row">
        <div class="lang-row-text">
          <span class="lang-row-title">{{ t.settings.language.label }}</span>
          <span class="lang-row-desc">{{ t.settings.language.hint }}</span>
          <span class="lang-row-desc lang-row-desc--muted">
            {{ t.settings.language.agentHint }}
          </span>
        </div>
        <select
          class="sp-input sp-select lang-select"
          :value="draft"
          :disabled="saving"
          @change="onLocaleChange"
        >
          <option
            v-for="entry in supportedLocales"
            :key="entry.id"
            :value="entry.id"
          >
            {{ entry.label }}
          </option>
        </select>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import {
  currentAppLocale,
  loadAppLocale,
  saveAppLocale,
} from '@renderer/i18n/appLocaleSettings'
import type { AppLocaleId } from '@renderer/i18n'
import './sp-shared.css'

const { t, supportedLocales } = useI18n()

const loading = ref(true)
const saving = ref(false)
const draft = ref<AppLocaleId>(currentAppLocale())

async function loadSettings(): Promise<void> {
  loading.value = true
  try {
    draft.value = await loadAppLocale()
  } finally {
    loading.value = false
  }
}

async function onLocaleChange(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value as AppLocaleId
  saving.value = true
  try {
    draft.value = await saveAppLocale(value)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadSettings()
})
</script>

<style scoped>
.lang-intro,
.lang-row-desc {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.lang-row-desc {
  margin: 0;
}

.lang-row-desc--muted {
  margin-top: 4px;
  font-size: 12px;
}

.lang-loading {
  font-size: 13px;
  color: var(--ui-text-muted);
}

.lang-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lang-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.lang-row-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.lang-row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
}

.lang-select {
  width: 12rem;
  flex-shrink: 0;
}
</style>
