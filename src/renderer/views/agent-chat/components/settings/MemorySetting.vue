<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.agentMemory }}</div>
    <p class="mem-intro">{{ p.memory.intro }}</p>

    <div v-if="loading" class="mem-loading">{{ t.common.loading }}</div>

    <template v-else>
      <div class="mem-subsection-title">{{ p.memory.recording }}</div>
      <div class="sp-card">
        <div
          v-for="layer in recordingLayersI18n"
          :key="layer.id"
          class="mem-row"
          :class="{
            'mem-row--nested': layer.nestedUnderBlock,
            'mem-row--disabled': isRecordingDisabled(layer),
          }"
        >
          <div class="mem-row-text">
            <span class="mem-row-title">{{ layer.title }}</span>
            <span class="mem-row-desc">{{ layer.description }}</span>
            <span class="mem-row-path">{{ layer.path }}</span>
            <span
              v-if="layer.requiresBlock && !settings.recording.block"
              class="mem-row-hint"
            >
              {{ p.memory.requiresBlock }}
            </span>
          </div>
          <label
            class="sp-toggle"
            :title="layerToggleTitle(layer)"
          >
            <input
              type="checkbox"
              :checked="settings.recording[layer.id]"
              :disabled="
                savingRecording === layer.id || isRecordingDisabled(layer)
              "
              @change="
                onRecordingToggle(
                  layer.id,
                  ($event.target as HTMLInputElement).checked,
                )
              "
            />
            <span
              class="sp-toggle-track"
              :class="{
                'sp-toggle-track--on': settings.recording[layer.id],
              }"
            />
          </label>
        </div>
      </div>

      <div class="mem-subsection-title">{{ p.memory.retention }}</div>
      <p class="mem-retention-intro">{{ p.memory.retentionIntro }}</p>
      <div class="sp-card">
        <div
          v-for="field in retentionFieldsI18n"
          :key="field.id"
          class="mem-row mem-row--retention"
        >
          <div class="mem-row-text">
            <span class="mem-row-title">{{ field.title }}</span>
            <span class="mem-row-desc">{{ field.description }}</span>
          </div>
          <input
            class="mem-retention-input aft-input"
            type="number"
            min="1"
            max="500"
            :value="settings.retention[field.id]"
            :disabled="savingRetention === field.id"
            @change="onRetentionChange(field.id, $event)"
          />
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import {
  getSystemConfigValues,
  setSystemConfigValue,
} from '@store/agent/config'
import {
  DEFAULT_MEMORY_SETTINGS,
  MEMORY_RECORDING_LAYER_UI,
  MEMORY_RECORDING_PROP_KEYS,
  MEMORY_RETENTION_FIELD_UI,
  MEMORY_RETENTION_PROP_KEYS,
  MEMORY_SETTINGS_PROP_KEYS,
  memoryRecordingFlagToString,
  parseMemorySettings,
  retentionCountToString,
  type MemoryRecordingLayer,
  type MemoryRetentionSettings,
} from '@shared/agent/memory-settings'
import './sp-shared.css'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)
const loading = ref(true)
const savingRecording = ref<MemoryRecordingLayer | null>(null)
const savingRetention = ref<keyof MemoryRetentionSettings | null>(null)

const settings = reactive({ ...DEFAULT_MEMORY_SETTINGS })

const recordingLayersI18n = computed(() =>
  MEMORY_RECORDING_LAYER_UI.map((layer) => ({
    ...layer,
    title: p.value.memory.layers[layer.id].title,
    description: p.value.memory.layers[layer.id].description,
  })),
)

const retentionFieldsI18n = computed(() =>
  MEMORY_RETENTION_FIELD_UI.map((field) => ({
    ...field,
    title: p.value.memory.retentionFields[field.id].title,
    description: p.value.memory.retentionFields[field.id].description,
  })),
)

function isRecordingDisabled(
  layer: (typeof MEMORY_RECORDING_LAYER_UI)[number],
): boolean {
  return Boolean(layer.requiresBlock && !settings.recording.block)
}

function layerToggleTitle(
  layer: (typeof recordingLayersI18n.value)[number],
): string {
  if (isRecordingDisabled(layer)) {
    return `${layer.title} ${p.value.memory.requiresBlockTitle}`
  }
  if (settings.recording[layer.id]) {
    return `${p.value.memory.disableLayer} ${layer.title}`
  }
  return `${p.value.memory.enableLayer} ${layer.title}`
}

function normalizeRecording(): void {
  if (!settings.recording.block) {
    settings.recording.vector = false
  }
}

async function loadSettings(): Promise<void> {
  loading.value = true
  try {
    const values = await getSystemConfigValues([...MEMORY_SETTINGS_PROP_KEYS])
    const parsed = parseMemorySettings(values)
    settings.recording = { ...parsed.recording }
    settings.retention = { ...parsed.retention }
    normalizeRecording()
  } finally {
    loading.value = false
  }
}

async function persistRecording(
  layer: MemoryRecordingLayer,
  enabled: boolean,
): Promise<void> {
  await setSystemConfigValue(
    MEMORY_RECORDING_PROP_KEYS[layer],
    memoryRecordingFlagToString(enabled),
  )
}

async function onRecordingToggle(
  layer: MemoryRecordingLayer,
  enabled: boolean,
): Promise<void> {
  const previous = {
    recording: { ...settings.recording },
    retention: { ...settings.retention },
  }
  settings.recording[layer] = enabled
  if (layer === 'block' && !enabled) {
    settings.recording.vector = false
  }
  savingRecording.value = layer
  try {
    await persistRecording(layer, enabled)
    if (layer === 'block' && !enabled && previous.recording.vector) {
      await persistRecording('vector', false)
    }
  } catch {
    settings.recording = previous.recording
    settings.retention = previous.retention
  } finally {
    savingRecording.value = null
  }
}

async function onRetentionChange(
  field: keyof MemoryRetentionSettings,
  event: Event,
): Promise<void> {
  const raw = Number((event.target as HTMLInputElement).value)
  const next = Number.isFinite(raw)
    ? Math.max(1, Math.min(500, Math.floor(raw)))
    : settings.retention[field]
  const previous = settings.retention[field]
  settings.retention[field] = next
  savingRetention.value = field
  try {
    await setSystemConfigValue(
      MEMORY_RETENTION_PROP_KEYS[field],
      retentionCountToString(next),
    )
  } catch {
    settings.retention[field] = previous
  } finally {
    savingRetention.value = null
  }
}

onMounted(() => {
  void loadSettings()
})
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
.mem-subsection-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  margin-top: 4px;
}
.mem-intro,
.mem-retention-intro {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}
.mem-intro code {
  font-size: 12px;
  font-family: var(--app-font-family);
}
.mem-loading {
  font-size: 13px;
  color: var(--ui-text-muted);
}
.mem-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 0;
}
.mem-row + .mem-row {
  border-top: 1px solid var(--ui-border);
  padding-top: 14px;
  margin-top: 4px;
}
.mem-row--nested {
  margin-left: 16px;
  padding-left: 12px;
  border-left: 2px solid var(--ui-border);
}
.mem-row--disabled {
  opacity: 0.65;
}
.mem-row--retention {
  align-items: center;
}
.mem-row-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.mem-row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
}
.mem-row-desc {
  font-size: 13px;
  line-height: 1.45;
  color: var(--ui-text-muted);
}
.mem-row-path {
  font-size: 11px;
  font-family: var(--app-font-family);
  color: var(--ui-text-dimmed, var(--ui-text-muted));
  opacity: 0.85;
}
.mem-row-hint {
  font-size: 12px;
  color: var(--ui-text-muted);
  font-style: italic;
}
.mem-retention-input {
  width: 72px;
  flex-shrink: 0;
  text-align: right;
}
</style>
