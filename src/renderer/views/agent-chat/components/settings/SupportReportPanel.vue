<template>
  <section class="sp-section support-section">
    <div class="sp-section-title">{{ t.settings.sections.reportProblem }}</div>
    <p class="support-intro">{{ p.support.intro }}</p>

    <div class="sp-card support-card">
      <label class="support-label" for="support-comments">
        {{ p.support.whatHappened }}
      </label>
      <textarea
        id="support-comments"
        v-model="comments"
        class="support-comments"
        rows="4"
        :placeholder="p.support.placeholder"
      />

      <div class="support-options">
        <label class="support-check">
          <input v-model="includeMemory" type="checkbox" />
          {{ p.support.includeMemory }}
        </label>
        <label class="support-check">
          <input v-model="includeSandbox" type="checkbox" />
          {{ p.support.includeSandbox }}
        </label>
      </div>

      <p v-if="supportConfig" class="support-meta">
        {{ p.support.uploadEndpoint }}
        <span class="support-meta-value">
          {{
            supportConfig.uploadConfigured
              ? supportConfig.uploadUrl
              : p.status.notConfigured
          }}
        </span>
      </p>
      <p v-if="!supportConfig?.uploadConfigured" class="support-hint">
        {{ p.support.uploadHint }}
      </p>

      <p v-if="statusMessage" class="support-status" role="status">
        {{ statusMessage }}
      </p>
      <p v-if="lastZipPath" class="support-path">
        {{ p.support.bundleSavedTo }}
        <code>{{ lastZipPath }}</code>
      </p>

      <div class="support-actions">
        <button
          type="button"
          class="support-btn"
          :disabled="busy || !comments.trim()"
          @click="onExport"
        >
          {{ p.actions.exportBundle }}
        </button>
        <button
          type="button"
          class="support-btn support-btn--primary"
          :disabled="busy || !comments.trim()"
          @click="onSubmit"
        >
          {{ p.actions.submitReport }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useAgentStore } from '@store/agent'
import type { SupportConfig } from '@shared/support-bundle'
import './sp-shared.css'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)
const agentStore = useAgentStore()

const comments = ref('')
const includeMemory = ref(true)
const includeSandbox = ref(false)
const busy = ref(false)
const statusMessage = ref('')
const lastZipPath = ref('')
const supportConfig = ref<SupportConfig | null>(null)

async function loadSupportConfig() {
  const channel = window.ipcRendererChannel?.GetSupportConfig
  if (!channel?.invoke) return
  supportConfig.value = await channel.invoke()
}

function buildPayload(upload: boolean) {
  return {
    comments: comments.value.trim(),
    conversationId: agentStore.currentConversationId ?? undefined,
    agentId: agentStore.selectedAgentId ?? undefined,
    includeMemory: includeMemory.value,
    includeSandbox: includeSandbox.value,
    upload,
  }
}

async function runReport(upload: boolean) {
  const channel = window.ipcRendererChannel?.SubmitSupportReport
  if (!channel?.invoke) {
    statusMessage.value = 'Support reporting is unavailable in this build.'
    return
  }

  busy.value = true
  statusMessage.value = upload ? 'Building and uploading report…' : 'Building report…'
  lastZipPath.value = ''

  try {
    const result = await channel.invoke(buildPayload(upload))
    if (!result.ok) {
      statusMessage.value = result.error ?? 'Report failed.'
      return
    }

    lastZipPath.value = result.zipPath ?? ''
    if (result.uploaded) {
      statusMessage.value = `Report ${result.reportId} uploaded successfully.`
      return
    }
    if (result.error) {
      statusMessage.value = result.error
      return
    }
    statusMessage.value = upload
      ? `Report ${result.reportId} saved locally (upload not configured).`
      : `Report ${result.reportId} exported.`
  } finally {
    busy.value = false
  }
}

async function onExport() {
  await runReport(false)
}

async function onSubmit() {
  await runReport(true)
}

onMounted(() => {
  void loadSupportConfig()
})
</script>

<style scoped>
.support-section {
  margin-top: 20px;
}

.support-intro {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.support-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.support-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text);
}

.support-comments {
  width: 100%;
  min-height: 96px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  resize: vertical;
  box-sizing: border-box;
}

.support-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.support-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ui-text);
}

.support-meta {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.support-meta-value {
  font-family: var(--app-font-family);
  word-break: break-all;
}

.support-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-warning-600, #d97706);
}

.support-hint code,
.support-path code {
  font-family: var(--app-font-family);
  font-size: 11px;
}

.support-status {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}

.support-path {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
  word-break: break-all;
}

.support-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.support-btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.support-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-text) 6%, transparent);
}

.support-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.support-btn--primary {
  border-color: color-mix(in srgb, var(--color-primary-500, #6366f1) 50%, var(--ui-border));
  background: color-mix(in srgb, var(--color-primary-500, #6366f1) 12%, transparent);
  color: var(--color-primary-600, var(--color-primary-500, #6366f1));
  font-weight: 600;
}
</style>
