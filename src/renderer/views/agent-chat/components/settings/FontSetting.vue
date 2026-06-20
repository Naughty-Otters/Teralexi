<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.font }}</div>
    <p class="font-intro">{{ t.settings.font.intro }}</p>

    <div v-if="loading" class="font-loading">{{ t.common.loading }}</div>

    <div v-else class="sp-card font-card">
      <div class="font-row">
        <div class="font-row-text">
          <span class="font-row-title">{{ t.settings.font.familyLabel }}</span>
          <span class="font-row-desc">{{ t.settings.font.familyHint }}</span>
        </div>
        <select
          class="sp-input sp-select font-select"
          :value="selectedPresetId"
          :disabled="saving === 'fontFamily'"
          @change="onFontFamilyChange"
        >
          <option
            v-if="selectedPresetId === 'custom'"
            value="custom"
          >
            {{ t.settings.font.customPreset }}
          </option>
          <option
            v-for="preset in FONT_FAMILY_PRESETS"
            :key="preset.id"
            :value="preset.id"
          >
            {{ t.settings.font.presets[preset.id] }}
          </option>
        </select>
      </div>

      <div class="font-row">
        <div class="font-row-text">
          <span class="font-row-title">{{ t.settings.font.sizeLabel }}</span>
          <span class="font-row-desc">{{ t.settings.font.sizeHint }}</span>
        </div>
        <div class="font-size-wrap">
          <input
            class="sp-input font-size-input"
            type="number"
            :min="MIN_APP_FONT_SIZE"
            :max="MAX_APP_FONT_SIZE"
            :value="draft.fontSize"
            :disabled="saving === 'fontSize'"
            @change="onFontSizeChange"
          />
          <span class="font-size-unit">{{ t.common.px }}</span>
        </div>
      </div>

      <p class="font-preview" :style="previewStyle">
        {{ t.settings.font.previewText }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import {
  DEFAULT_FONT_SETTINGS,
  FONT_FAMILY_PRESETS,
  MAX_APP_FONT_SIZE,
  MIN_APP_FONT_SIZE,
  clampAppFontSize,
  resolveFontFamilyPresetId,
  type FontFamilyPresetId,
  type FontSettings,
} from '@shared/ui/font-settings'
import { loadFontSettings, saveFontSettings } from '@renderer/fontSettings'
import './sp-shared.css'

const { t } = useI18n()

const loading = ref(true)
const saving = ref<keyof FontSettings | null>(null)
const draft = reactive({ ...DEFAULT_FONT_SETTINGS })

const selectedPresetId = computed(() =>
  resolveFontFamilyPresetId(draft.fontFamily),
)

const previewStyle = computed(() => ({
  fontFamily: draft.fontFamily,
  fontSize: `${draft.fontSize}px`,
}))

async function loadSettings(): Promise<void> {
  loading.value = true
  try {
    const settings = await loadFontSettings()
    draft.fontFamily = settings.fontFamily
    draft.fontSize = settings.fontSize
  } finally {
    loading.value = false
  }
}

async function persist(partial: Partial<FontSettings>): Promise<void> {
  const key = Object.keys(partial)[0] as keyof FontSettings | undefined
  if (!key) return
  saving.value = key
  try {
    const next = await saveFontSettings({
      fontFamily: draft.fontFamily,
      fontSize: draft.fontSize,
      ...partial,
    })
    draft.fontFamily = next.fontFamily
    draft.fontSize = next.fontSize
  } finally {
    saving.value = null
  }
}

function onFontFamilyChange(event: Event): void {
  const presetId = (event.target as HTMLSelectElement)
    .value as FontFamilyPresetId
  const preset = FONT_FAMILY_PRESETS.find((entry) => entry.id === presetId)
  if (!preset) return
  draft.fontFamily = preset.value
  void persist({ fontFamily: preset.value })
}

function onFontSizeChange(event: Event): void {
  const raw = Number.parseInt((event.target as HTMLInputElement).value, 10)
  const next = clampAppFontSize(raw)
  draft.fontSize = next
  void persist({ fontSize: next })
}

onMounted(() => {
  void loadSettings()
})
</script>

<style scoped>
.font-intro,
.font-row-desc {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.font-row-desc {
  margin: 0;
}

.font-loading {
  font-size: 13px;
  color: var(--ui-text-muted);
}

.font-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.font-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.font-row-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.font-row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
}

.font-select {
  width: 14rem;
  flex-shrink: 0;
}

.font-size-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.font-size-input {
  width: 5rem;
}

.font-size-unit {
  font-size: 12px;
  color: var(--ui-text-muted);
}

.font-preview {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-elevated, var(--ui-bg));
  color: var(--ui-text);
  line-height: 1.5;
}
</style>
