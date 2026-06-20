<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.about }}</div>
    <p class="about-intro">{{ p.about.intro }}</p>

    <div class="sp-card about-card">
      <div class="about-row">
        <span class="about-label">{{ p.fields.version }}</span>
        <span class="about-value">v{{ displayVersion }}</span>
      </div>
      <div v-if="!isPackaged" class="about-hint">
        {{ p.about.sourceHint }}
      </div>

      <div class="about-status" role="status">
        <template v-if="state.phase === 'checking'">
          {{ p.status.checkingUpdates }}
        </template>
        <template v-else-if="state.phase === 'available'">
          <strong>v{{ state.newVersion }}</strong> {{ p.status.updateAvailable }}
        </template>
        <template v-else-if="state.phase === 'not-available'">
          {{ p.status.latestVersion }}
        </template>
        <template v-else-if="state.phase === 'downloading'">
          {{ p.status.downloading }} {{ state.percent ?? 0 }}%
        </template>
        <template v-else-if="state.phase === 'downloaded'">
          {{ p.status.updateReady }}
          <span v-if="state.newVersion"> (v{{ state.newVersion }})</span>.
        </template>
        <template v-else-if="state.phase === 'error'">
          {{ state.error ?? p.status.updateFailed }}
        </template>
      </div>

      <div
        v-if="state.phase === 'downloading'"
        class="about-progress"
        role="progressbar"
        :aria-valuenow="state.percent ?? 0"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="about-progress-bar"
          :style="{ width: `${state.percent ?? 0}%` }"
        />
      </div>

      <pre
        v-if="releaseNotes"
        class="about-notes"
      >{{ releaseNotes }}</pre>

      <div class="about-actions">
        <button
          type="button"
          class="about-btn"
          :disabled="busy"
          @click="onCheck"
        >
          {{ p.actions.checkForUpdates }}
        </button>
        <button
          v-if="state.phase === 'available'"
          type="button"
          class="about-btn about-btn--primary"
          :disabled="busy"
          @click="onDownload"
        >
          {{ p.actions.downloadUpdate }}
        </button>
        <button
          v-if="state.phase === 'downloaded'"
          type="button"
          class="about-btn about-btn--primary"
          @click="onInstall"
        >
          {{ p.actions.restartInstall }}
        </button>
      </div>
    </div>

    <SupportReportPanel />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import {
  downloadAppUpdate,
  checkForAppUpdate,
  installAppUpdate,
  loadAppVersion,
  useAppUpdate,
} from '@renderer/composables/useAppUpdate'
import SupportReportPanel from './SupportReportPanel.vue'
import './sp-shared.css'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)
const { state } = useAppUpdate()
const isPackaged = ref(false)

const displayVersion = computed(() => state.currentVersion || '…')

const busy = computed(
  () => state.phase === 'checking' || state.phase === 'downloading',
)

const releaseNotes = computed(() => {
  const notes = state.releaseNotes?.trim()
  if (!notes) return ''
  if (state.phase !== 'available' && state.phase !== 'downloaded') return ''
  return notes
})

async function onCheck() {
  await checkForAppUpdate()
}

async function onDownload() {
  await downloadAppUpdate()
}

async function onInstall() {
  await installAppUpdate()
}

onMounted(async () => {
  const info = await loadAppVersion()
  isPackaged.value = info.isPackaged
})
</script>

<style scoped>
.about-intro {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.about-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.about-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.about-label {
  font-size: 13px;
  color: var(--ui-text-muted);
}

.about-value {
  font-size: 14px;
  font-weight: 600;
  font-family: var(--app-font-family);
}

.about-hint {
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-warning-600, #d97706);
}

.about-status {
  font-size: 13px;
  line-height: 1.45;
  color: var(--ui-text);
}

.about-progress {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-text) 10%, transparent);
  overflow: hidden;
}

.about-progress-bar {
  height: 100%;
  border-radius: inherit;
  background: var(--color-primary-500, #6366f1);
  transition: width 0.2s ease;
}

.about-notes {
  margin: 0;
  padding: 10px 12px;
  max-height: 160px;
  overflow: auto;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-text) 4%, transparent);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.about-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.about-btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.about-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-text) 6%, transparent);
}

.about-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.about-btn--primary {
  border-color: color-mix(in srgb, var(--color-primary-500, #6366f1) 50%, var(--ui-border));
  background: color-mix(in srgb, var(--color-primary-500, #6366f1) 12%, transparent);
  color: var(--color-primary-600, var(--color-primary-500, #6366f1));
  font-weight: 600;
}
</style>
