<template>
  <section class="clawhub-root sp-section">
    <div class="sp-section-title-row">
      <span class="sp-section-title">{{ p.clawhub.title }}</span>
    </div>

    <p class="clawhub-hint">{{ p.clawhub.hint }}</p>

    <div class="clawhub-search-row">
      <input
        v-model="searchQuery"
        class="sp-input clawhub-search-input"
        type="search"
        :placeholder="p.clawhub.searchPlaceholder"
        @keydown.enter.prevent="runSearch"
      />
      <button
        type="button"
        class="clawhub-btn clawhub-btn--primary"
        :disabled="searching || !searchQuery.trim()"
        @click="runSearch"
      >
        {{ searching ? p.clawhub.searching : p.clawhub.search }}
      </button>
    </div>

    <p v-if="searchError" class="clawhub-msg clawhub-msg--error">{{ searchError }}</p>

    <div v-if="searchResults.length > 0" class="clawhub-results">
      <button
        v-for="hit in searchResults"
        :key="hit.slug"
        type="button"
        class="clawhub-result"
        :class="{ 'clawhub-result--active': selectedSlug === hit.slug }"
        @click="selectHit(hit.slug)"
      >
        <span class="clawhub-result-name">{{ hit.displayName }}</span>
        <span class="clawhub-result-meta">{{ hit.slug }} · v{{ hit.version }}</span>
        <span v-if="hit.summary" class="clawhub-result-summary">{{ hit.summary }}</span>
      </button>
    </div>

    <div v-if="selectedDetail" class="clawhub-detail">
      <div class="clawhub-detail-header">
        <div>
          <h3 class="clawhub-detail-title">{{ selectedDetail.displayName }}</h3>
          <p class="clawhub-detail-slug">{{ selectedDetail.slug }}</p>
        </div>
        <button
          type="button"
          class="clawhub-btn clawhub-btn--primary clawhub-btn--install"
          :disabled="installing"
          @click="installSelected"
        >
          {{ installing ? p.clawhub.installing : p.clawhub.install }}
        </button>
      </div>

      <p v-if="selectedDetail.summary" class="clawhub-detail-summary">
        {{ selectedDetail.summary }}
      </p>

      <p class="clawhub-detail-version">
        {{ p.clawhub.latestVersion }}: v{{ selectedDetail.latestVersion.version }}
      </p>

      <p v-if="detailError" class="clawhub-msg clawhub-msg--error">{{ detailError }}</p>
      <p v-if="installMessage" class="clawhub-msg">{{ installMessage }}</p>

      <div v-if="previewContent" class="clawhub-preview">
        <p class="clawhub-preview-label">{{ p.clawhub.preview }}</p>
        <pre class="clawhub-preview-body">{{ previewContent }}</pre>
      </div>
    </div>

    <div class="clawhub-installed-header">
      <span class="sp-section-title">{{ p.clawhub.installedTitle }}</span>
      <button
        type="button"
        class="clawhub-btn clawhub-btn--secondary"
        :disabled="installedBusy || installed.length === 0"
        @click="updateAll"
      >
        {{ installedBusy ? p.clawhub.updatingAll : p.clawhub.updateAll }}
      </button>
    </div>

    <p v-if="installedError" class="clawhub-msg clawhub-msg--error">{{ installedError }}</p>
    <p v-if="installedMessage" class="clawhub-msg">{{ installedMessage }}</p>

    <div v-if="installedLoading" class="clawhub-empty">{{ p.clawhub.loadingInstalled }}</div>
    <div v-else-if="installed.length === 0" class="clawhub-empty">
      {{ p.clawhub.noInstalled }}
    </div>
    <div v-else class="clawhub-installed-list">
      <div v-for="row in installed" :key="row.localSkillId" class="clawhub-installed-row">
        <div class="clawhub-installed-info">
          <div class="clawhub-installed-title-row">
            <span class="clawhub-installed-name">{{ row.displayName }}</span>
            <span
              v-if="row.updateAvailable"
              class="clawhub-update-badge"
            >
              Update
            </span>
          </div>
          <span class="clawhub-installed-meta">
            {{ row.localSkillId }} · v{{ row.version }}
            <span v-if="row.updateAvailable && row.latestVersion" class="clawhub-installed-latest">
              → v{{ row.latestVersion }}
            </span>
          </span>
        </div>
        <div class="clawhub-installed-actions">
          <button
            type="button"
            class="clawhub-btn"
            :class="
              row.updateAvailable
                ? 'clawhub-btn--primary'
                : 'clawhub-btn--secondary'
            "
            :disabled="rowBusy === row.localSkillId"
            @click="updateOne(row.localSkillId)"
          >
            {{ row.updateAvailable ? p.clawhub.update : p.clawhub.checkUpdate }}
          </button>
          <button
            type="button"
            class="clawhub-btn clawhub-btn--danger"
            :disabled="rowBusy === row.localSkillId"
            @click="uninstallOne(row.localSkillId)"
          >
            {{ p.clawhub.uninstall }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useAgentStore } from '@store/agent'
import type {
  ClawHubInstalledSkill,
  ClawHubSkillDetail,
  ClawHubSkillSearchHit,
} from '@shared/skills/clawhub-types'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)
const agentStore = useAgentStore()

const searchQuery = ref('')
const searchResults = ref<ClawHubSkillSearchHit[]>([])
const searching = ref(false)
const searchError = ref('')

const selectedSlug = ref<string | null>(null)
const selectedDetail = ref<ClawHubSkillDetail | null>(null)
const previewContent = ref('')
const detailError = ref('')
const installing = ref(false)
const installMessage = ref('')

const installed = ref<ClawHubInstalledSkill[]>([])
const installedLoading = ref(false)
const installedBusy = ref(false)
const rowBusy = ref<string | null>(null)
const installedError = ref('')
const installedMessage = ref('')

async function refreshInstalled(): Promise<void> {
  const channel = window.ipcRendererChannel?.ListClawHubInstalledSkills
  if (!channel) {
    installedError.value = 'ListClawHubInstalledSkills API unavailable'
    return
  }
  installedLoading.value = true
  installedError.value = ''
  try {
    installed.value = await channel.invoke()
  } catch (err) {
    installedError.value = err instanceof Error ? err.message : String(err)
  } finally {
    installedLoading.value = false
  }
}

async function runSearch(): Promise<void> {
  const query = searchQuery.value.trim()
  if (!query) return
  const channel = window.ipcRendererChannel?.SearchClawHubSkills
  if (!channel) {
    searchError.value = 'SearchClawHubSkills API unavailable'
    return
  }
  searching.value = true
  searchError.value = ''
  selectedSlug.value = null
  selectedDetail.value = null
  previewContent.value = ''
  try {
    const result = await channel.invoke({ query, limit: 20 })
    searchResults.value = result.results
  } catch (err) {
    searchError.value = err instanceof Error ? err.message : String(err)
  } finally {
    searching.value = false
  }
}

async function selectHit(slug: string): Promise<void> {
  selectedSlug.value = slug
  selectedDetail.value = null
  previewContent.value = ''
  detailError.value = ''
  installMessage.value = ''

  const detailChannel = window.ipcRendererChannel?.GetClawHubSkill
  const previewChannel = window.ipcRendererChannel?.PreviewClawHubSkillFile
  if (!detailChannel) {
    detailError.value = 'GetClawHubSkill API unavailable'
    return
  }

  try {
    selectedDetail.value = await detailChannel.invoke({ slug })
    if (previewChannel) {
      const preview = await previewChannel.invoke({ slug, path: 'SKILL.md' })
      previewContent.value = preview.content.slice(0, 4000)
    }
  } catch (err) {
    detailError.value = err instanceof Error ? err.message : String(err)
  }
}

async function afterInstallRefresh(localSkillId: string): Promise<void> {
  await agentStore.loadSkillsFromDisk()
  await refreshInstalled()
  installMessage.value = `${p.value.clawhub.installedSuccess}: ${localSkillId}`
}

async function installSelected(): Promise<void> {
  if (!selectedDetail.value) return
  const channel = window.ipcRendererChannel?.InstallClawHubSkill
  if (!channel) {
    detailError.value = 'InstallClawHubSkill API unavailable'
    return
  }
  installing.value = true
  detailError.value = ''
  installMessage.value = ''
  try {
    const result = await channel.invoke({ slug: selectedDetail.value.slug })
    if (!result.ok) {
      detailError.value = result.error ?? p.value.clawhub.installFailed
      return
    }
    await afterInstallRefresh(result.localSkillId)
  } catch (err) {
    detailError.value = err instanceof Error ? err.message : String(err)
  } finally {
    installing.value = false
  }
}

async function updateOne(localSkillId: string): Promise<void> {
  const channel = window.ipcRendererChannel?.UpdateClawHubSkill
  if (!channel) return
  rowBusy.value = localSkillId
  installedMessage.value = ''
  installedError.value = ''
  try {
    const result = await channel.invoke({ localSkillId })
    if (!result.ok) {
      installedError.value = result.error ?? p.value.clawhub.updateFailed
      return
    }
    await agentStore.loadSkillsFromDisk()
    await refreshInstalled()
    installedMessage.value = `${p.value.clawhub.updated}: ${localSkillId}`
  } catch (err) {
    installedError.value = err instanceof Error ? err.message : String(err)
  } finally {
    rowBusy.value = null
  }
}

async function updateAll(): Promise<void> {
  const channel = window.ipcRendererChannel?.UpdateAllClawHubSkills
  if (!channel) return
  installedBusy.value = true
  installedMessage.value = ''
  installedError.value = ''
  try {
    const results = await channel.invoke()
    await agentStore.loadSkillsFromDisk()
    await refreshInstalled()
    const updated = results.filter((r) => r.status === 'updated').length
    installedMessage.value = `${p.value.clawhub.updateAllDone}: ${updated}`
  } catch (err) {
    installedError.value = err instanceof Error ? err.message : String(err)
  } finally {
    installedBusy.value = false
  }
}

async function uninstallOne(localSkillId: string): Promise<void> {
  const channel = window.ipcRendererChannel?.UninstallClawHubSkill
  if (!channel) return
  rowBusy.value = localSkillId
  installedMessage.value = ''
  installedError.value = ''
  try {
    const result = await channel.invoke({ localSkillId })
    if (!result.ok) {
      installedError.value = result.error ?? p.value.clawhub.uninstallFailed
      return
    }
    await agentStore.loadSkillsFromDisk()
    await refreshInstalled()
    installedMessage.value = `${p.value.clawhub.uninstalled}: ${localSkillId}`
  } catch (err) {
    installedError.value = err instanceof Error ? err.message : String(err)
  } finally {
    rowBusy.value = null
  }
}

onMounted(() => {
  void refreshInstalled()
})
</script>

<style scoped>
@import './sp-shared.css';
.clawhub-root {
  margin-bottom: 0;
}

.clawhub-hint {
  margin: 0 0 12px;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.clawhub-search-row {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  align-items: stretch;
}

.clawhub-search-input {
  flex: 1;
  min-width: 0;
}

/* ── Buttons (aligned with MCP / skill compilation panels) ── */
.clawhub-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 16px;
  min-height: 34px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  line-height: 1.2;
  white-space: nowrap;
  border-radius: 8px;
  cursor: pointer;
  border: 1.5px solid var(--ui-border);
  background: var(--ui-bg);
  color: var(--ui-text);
  transition:
    background 0.12s,
    border-color 0.12s,
    color 0.12s,
    opacity 0.12s,
    box-shadow 0.12s;
}

.clawhub-btn:hover:not(:disabled) {
  background: var(--ui-bg-accented);
  border-color: color-mix(in srgb, var(--color-primary-500) 40%, var(--ui-border));
}

.clawhub-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-primary-500) 55%, transparent);
  outline-offset: 2px;
}

.clawhub-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.clawhub-btn--primary {
  background: color-mix(in srgb, var(--color-primary-500) 14%, transparent);
  color: var(--color-primary-700);
  border-color: var(--color-primary-500);
}

.clawhub-btn--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary-500) 22%, transparent);
  border-color: var(--color-primary-500);
}

.clawhub-btn--secondary {
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
  border-color: var(--ui-border);
}

.clawhub-btn--secondary:hover:not(:disabled) {
  background: var(--ui-bg-accented);
  border-color: var(--ui-text-muted);
}

.clawhub-btn--danger {
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 10%, transparent);
  color: var(--color-error-700, #b91c1c);
  border-color: color-mix(in srgb, var(--color-error-500, #ef4444) 45%, transparent);
}

.clawhub-btn--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 18%, transparent);
  border-color: var(--color-error-500, #ef4444);
}

.clawhub-btn--install {
  flex-shrink: 0;
  min-width: 96px;
}

:global(html.dark) .clawhub-btn--primary {
  color: var(--color-primary-300);
}

:global(html.dark) .clawhub-btn--danger {
  color: var(--color-error-300, #fca5a5);
  border-color: color-mix(in srgb, var(--color-error-400, #f87171) 55%, transparent);
}

.clawhub-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.clawhub-result {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px 14px;
  border: 1.5px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-bg-elevated);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  color: inherit;
  transition:
    border-color 0.12s,
    background 0.12s,
    box-shadow 0.12s;
}

.clawhub-result:hover {
  background: var(--ui-bg-accented);
  border-color: color-mix(in srgb, var(--color-primary-500) 35%, var(--ui-border));
}

.clawhub-result--active {
  border-color: var(--color-primary-500);
  background: color-mix(in srgb, var(--color-primary-500) 8%, var(--ui-bg-elevated));
  box-shadow: inset 3px 0 0 var(--color-primary-500);
}

.clawhub-result-name {
  font-weight: 600;
}

.clawhub-result-meta,
.clawhub-result-summary {
  font-size: 12px;
  color: var(--ui-text-muted);
}

.clawhub-detail {
  margin-bottom: 22px;
  padding: 14px 16px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-bg-elevated);
}

.clawhub-detail-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.clawhub-detail-title {
  margin: 0;
  font-size: 16px;
}

.clawhub-detail-slug,
.clawhub-detail-version,
.clawhub-detail-summary {
  margin: 6px 0 0;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.clawhub-preview {
  margin-top: 12px;
}

.clawhub-preview-label {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.clawhub-preview-body {
  max-height: 240px;
  overflow: auto;
  margin: 0;
  padding: 10px;
  border-radius: 6px;
  background: var(--ui-bg);
  font-size: 12px;
  white-space: pre-wrap;
}

.clawhub-installed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 8px 0 12px;
  padding-top: 4px;
}

.clawhub-installed-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.clawhub-installed-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-bg-elevated);
  transition: border-color 0.12s, background 0.12s;
}

.clawhub-installed-row:hover {
  border-color: color-mix(in srgb, var(--color-primary-500) 25%, var(--ui-border));
  background: var(--ui-bg-accented);
}

.clawhub-installed-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.clawhub-installed-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.clawhub-installed-name {
  font-weight: 600;
  font-size: 14px;
}

.clawhub-update-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-primary-700);
  background: color-mix(in srgb, var(--color-primary-500) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary-500) 35%, transparent);
}

.clawhub-installed-meta {
  font-size: 12px;
  color: var(--ui-text-muted);
  word-break: break-all;
}

.clawhub-installed-latest {
  color: var(--color-primary-600);
  font-weight: 500;
}

.clawhub-installed-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

@media (max-width: 640px) {
  .clawhub-installed-row {
    flex-direction: column;
    align-items: stretch;
  }

  .clawhub-installed-actions {
    justify-content: stretch;
  }

  .clawhub-installed-actions .clawhub-btn {
    flex: 1;
  }
}

.clawhub-empty {
  color: var(--ui-text-muted);
  font-size: 13px;
}

.clawhub-msg {
  margin: 8px 0;
  font-size: 13px;
}

.clawhub-msg--error {
  color: var(--ui-danger, #c0392b);
}
</style>
