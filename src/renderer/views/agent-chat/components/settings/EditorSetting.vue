<template>
  <section class="sp-section">
    <div class="sp-section-title">Code editor</div>
    <p class="editor-intro">
      Workspace file editor preferences for formatting, indentation, and linting.
    </p>

    <div v-if="loading" class="editor-loading">{{ t.common.loading }}</div>

    <div v-else class="sp-card editor-card">
      <div class="editor-row">
        <div class="editor-row-text">
          <span class="editor-row-title">Format on save</span>
          <span class="editor-row-desc">
            Run Prettier before saving when a Prettier config exists in the project.
          </span>
        </div>
        <label class="sp-toggle">
          <input
            type="checkbox"
            :checked="settings.formatOnSave"
            :disabled="saving === 'formatOnSave'"
            @change="
              onToggle(
                'formatOnSave',
                ($event.target as HTMLInputElement).checked,
              )
            "
          />
          <span
            class="sp-toggle-track"
            :class="{ 'sp-toggle-track--on': settings.formatOnSave }"
          />
        </label>
      </div>

      <div class="editor-row">
        <div class="editor-row-text">
          <span class="editor-row-title">Tab size</span>
          <span class="editor-row-desc">Spaces per tab in the file editor.</span>
        </div>
        <input
          class="sp-input editor-number"
          type="number"
          min="1"
          max="8"
          :value="settings.tabSize"
          :disabled="saving === 'tabSize'"
          @change="onTabSizeChange"
        />
      </div>

      <div class="editor-row">
        <div class="editor-row-text">
          <span class="editor-row-title">Insert spaces</span>
          <span class="editor-row-desc">Use spaces instead of tab characters.</span>
        </div>
        <label class="sp-toggle">
          <input
            type="checkbox"
            :checked="settings.insertSpaces"
            :disabled="saving === 'insertSpaces'"
            @change="
              onToggle(
                'insertSpaces',
                ($event.target as HTMLInputElement).checked,
              )
            "
          />
          <span
            class="sp-toggle-track"
            :class="{ 'sp-toggle-track--on': settings.insertSpaces }"
          />
        </label>
      </div>

      <div class="editor-row">
        <div class="editor-row-text">
          <span class="editor-row-title">ESLint while typing</span>
          <span class="editor-row-desc">
            Show ESLint diagnostics in the editor when a project ESLint config exists.
          </span>
        </div>
        <label class="sp-toggle">
          <input
            type="checkbox"
            :checked="settings.eslintEnabled"
            :disabled="saving === 'eslintEnabled'"
            @change="
              onToggle(
                'eslintEnabled',
                ($event.target as HTMLInputElement).checked,
              )
            "
          />
          <span
            class="sp-toggle-track"
            :class="{ 'sp-toggle-track--on': settings.eslintEnabled }"
          />
        </label>
      </div>

      <div class="editor-row">
        <div class="editor-row-text">
          <span class="editor-row-title">ESLint debounce (ms)</span>
          <span class="editor-row-desc">Delay before re-running ESLint after edits.</span>
        </div>
        <input
          class="sp-input editor-number"
          type="number"
          min="200"
          max="5000"
          step="100"
          :value="settings.eslintDebounceMs"
          :disabled="saving === 'eslintDebounceMs'"
          @change="onEslintDebounceChange"
        />
      </div>

      <div class="editor-divider" />

      <EditorAiCompletionFields
        :model-value="aiSettings"
        :disabled="Boolean(savingAi)"
        @update:model-value="onAiSettingsChange"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import {
  DEFAULT_EDITOR_SETTINGS,
  EDITOR_SETTINGS_PROP_KEYS,
  parseEditorSettings,
  type EditorSettings,
} from '@shared/editor/editor-settings'
import {
  DEFAULT_EDITOR_AI_COMPLETION_SETTINGS,
  EDITOR_AI_COMPLETION_PROP_KEYS,
  parseEditorAiCompletionSettings,
  type EditorAiCompletionSettings,
} from '@shared/editor/editor-ai-completion-settings'
import EditorAiCompletionFields from '@renderer/components/code/EditorAiCompletionFields.vue'
import { persistEditorAiCompletionSettings } from '@renderer/components/code/editor-ai-completion-persist'
import {
  getSystemConfigValues,
  setSystemConfigValue,
} from '@store/agent/config'
import './sp-shared.css'

const { t } = useI18n()
const loading = ref(true)
const saving = ref<keyof EditorSettings | null>(null)
const savingAi = ref(false)
const settings = reactive({ ...DEFAULT_EDITOR_SETTINGS })
const aiSettings = reactive({ ...DEFAULT_EDITOR_AI_COMPLETION_SETTINGS })

async function loadSettings(): Promise<void> {
  loading.value = true
  try {
    const values = await getSystemConfigValues([
      ...Object.values(EDITOR_SETTINGS_PROP_KEYS),
      ...Object.values(EDITOR_AI_COMPLETION_PROP_KEYS),
    ])
    Object.assign(settings, parseEditorSettings(values))
    Object.assign(aiSettings, parseEditorAiCompletionSettings(values))
  } finally {
    loading.value = false
  }
}

async function onAiSettingsChange(next: EditorAiCompletionSettings): Promise<void> {
  Object.assign(aiSettings, next)
  savingAi.value = true
  try {
    await persistEditorAiCompletionSettings(next)
  } finally {
    savingAi.value = false
  }
}

async function persist(key: keyof EditorSettings, value: string): Promise<void> {
  saving.value = key
  try {
    await setSystemConfigValue(EDITOR_SETTINGS_PROP_KEYS[key], value)
  } finally {
    saving.value = null
  }
}

function onToggle(key: keyof EditorSettings, checked: boolean): void {
  settings[key] = checked as never
  void persist(key, checked ? 'true' : 'false')
}

function onTabSizeChange(event: Event): void {
  const raw = Number.parseInt((event.target as HTMLInputElement).value, 10)
  const next = Number.isFinite(raw) ? Math.min(8, Math.max(1, raw)) : settings.tabSize
  settings.tabSize = next
  void persist('tabSize', String(next))
}

function onEslintDebounceChange(event: Event): void {
  const raw = Number.parseInt((event.target as HTMLInputElement).value, 10)
  const next = Number.isFinite(raw)
    ? Math.min(5000, Math.max(200, raw))
    : settings.eslintDebounceMs
  settings.eslintDebounceMs = next
  void persist('eslintDebounceMs', String(next))
}

onMounted(() => {
  void loadSettings()
})
</script>

<style scoped>
.editor-intro,
.editor-row-desc {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.editor-row-desc {
  margin: 0;
}

.editor-loading {
  font-size: 13px;
  color: var(--ui-text-muted);
}

.editor-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.editor-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.editor-row-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.editor-row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
}

.editor-number {
  width: 5rem;
  flex-shrink: 0;
}

.editor-divider {
  height: 1px;
  background: var(--ui-border);
}
</style>
