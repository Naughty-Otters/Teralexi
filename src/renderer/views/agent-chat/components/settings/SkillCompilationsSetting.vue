<template>
  <section class="scs-root sp-section">
    <div class="sp-section-title-row">
        <span class="sp-section-title">{{ t.settings.sections.skillCompilation }}</span>
    </div>

    <p class="scs-hint">
      {{ p.skills.hint }}
    </p>

    <div class="scs-toolbar">
      <button
        type="button"
        class="sp-action-btn sp-action-btn--confirm"
        :disabled="actionsLocked"
        @click="compileAll(false)"
      >
        {{ busy && bulkMode === 'load' ? p.skills.loadingAll : p.actions.loadAllCompilations }}
      </button>
      <button
        type="button"
        class="sp-action-btn"
        :disabled="actionsLocked"
        @click="compileAll(true)"
      >
        {{
          busy && bulkMode === 'force'
            ? p.skills.recompilingAll
            : p.actions.forceRecompileAll
        }}
      </button>
      <button
        type="button"
        class="sp-action-btn"
        :disabled="actionsLocked"
        @click="refresh"
      >
        {{ loading ? p.skills.refreshing : p.actions.refresh }}
      </button>
    </div>

    <p v-if="bulkMessage" class="scs-bulk-msg" :class="{ 'scs-bulk-msg--error': bulkError }">
      {{ bulkMessage }}
    </p>

    <div v-if="loading" class="scs-empty">{{ p.skills.loadingList }}</div>
    <div v-else-if="loadError" class="scs-empty scs-empty--error">{{ loadError }}</div>
    <div v-else-if="rows.length === 0" class="scs-empty">{{ p.skills.noSkills }}</div>

    <div v-else class="scs-table-wrap">
      <table class="scs-table">
        <thead>
          <tr>
            <th>{{ p.skills.table.skill }}</th>
            <th>{{ p.skills.table.source }}</th>
            <th>{{ p.skills.table.status }}</th>
            <th>{{ p.skills.table.compileLlm }}</th>
            <th>{{ p.skills.table.compileProvider }}</th>
            <th>{{ p.skills.table.compileModel }}</th>
            <th>{{ p.skills.table.compiled }}</th>
            <th>{{ p.skills.table.actions }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.skillId">
            <td>
              <span class="scs-skill-name">{{ row.name }}</span>
              <span class="scs-skill-id">{{ row.skillId }}</span>
            </td>
            <td>{{ row.source ?? '—' }}</td>
            <td>
              <span :class="`scs-status scs-status--${row.status}`">
                {{ statusLabel(row) }}
              </span>
            </td>
            <td class="scs-compile-llm">
              <span class="scs-compile-effective">
                {{ row.compileProvider }} / {{ row.compileModel }}
              </span>
              <span class="scs-compile-source">{{ compileSourceLabel(row) }}</span>
            </td>
            <td>
              <select
                class="scs-select scs-select--row"
                :value="rowOverrideProvider(row)"
                :disabled="isRowLocked(row)"
                @change="onRowProviderChange(row, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">
                  Skill properties ({{ row.skillProvider }}/{{ row.skillModel }})
                </option>
                <option
                  v-for="p in SKILL_COMPILE_PROVIDERS"
                  :key="p"
                  :value="p"
                >
                  {{ SKILL_COMPILE_PROVIDER_LABELS[p] }}
                </option>
              </select>
            </td>
            <td>
              <select
                v-if="rowOverrideProvider(row) && rowModels(row).length > 0"
                class="scs-select scs-select--row"
                :value="rowOverrideModel(row)"
                :disabled="isRowLocked(row)"
                @change="onRowModelChange(row, ($event.target as HTMLSelectElement).value)"
              >
                <option value="" disabled>Select model…</option>
                <option
                  v-if="
                    rowOverrideModel(row) &&
                    !rowModels(row).includes(rowOverrideModel(row))
                  "
                  :value="rowOverrideModel(row)"
                >
                  {{ rowOverrideModel(row) }} (saved)
                </option>
                <option v-for="m in rowModels(row)" :key="m" :value="m">
                  {{ m }}
                </option>
              </select>
              <span v-else-if="!rowOverrideProvider(row)" class="scs-muted">—</span>
              <input
                v-else
                class="scs-select scs-select--row"
                type="text"
                :value="rowOverrideModel(row)"
                :disabled="isRowLocked(row)"
                @change="onRowModelChange(row, ($event.target as HTMLInputElement).value)"
              />
            </td>
            <td class="scs-compiled-at">
              {{ row.compiledAt ? formatWhen(row.compiledAt) : '—' }}
            </td>
            <td class="scs-row-actions">
              <button
                type="button"
                class="scs-link-btn"
                :disabled="isEditDisabled(row)"
                @click="openEditor(row.skillId)"
              >
                {{ rowBusy === row.skillId ? '…' : 'Edit' }}
              </button>
              <button
                type="button"
                class="scs-link-btn"
                :disabled="isRowLocked(row)"
                @click="compileOne(row.skillId, false)"
              >
                {{ rowBusy === row.skillId && rowBusyMode === 'load' ? p.skills.loadingAll : 'Load' }}
              </button>
              <button
                type="button"
                class="scs-link-btn"
                :disabled="isRowLocked(row)"
                @click="compileOne(row.skillId, true)"
              >
                {{
                  rowBusy === row.skillId && rowBusyMode === 'force'
                    ? p.skills.recompilingAll
                    : 'Force'
                }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="editingSkillId"
      class="scs-modal-backdrop"
      @click.self="closeEditorIfIdle"
    >
      <div class="scs-modal" role="dialog" aria-modal="true">
        <SkillCompilationPanel
          :skill-id="editingSkillId"
          editable
          dialog
          @saved="onEditorSaved"
          @close="closeEditorIfIdle"
          @busy-change="panelBusy = $event"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useAgentStore } from '@store/agent'
import {
  getSystemConfigValues,
  setSystemConfigValue,
} from '@store/agent/config'
import type { ProviderType } from '@store/agent/types'
import {
  parseSkillCompileSettings,
  serializeSkillCompilePerSkillOverrides,
  SKILL_COMPILE_PROP_KEYS,
  SKILL_COMPILE_PROVIDER_LABELS,
  SKILL_COMPILE_PROVIDERS,
  type SkillCompileLlmSource,
  type SkillCompilePerSkillOverrides,
  type SkillCompileProvider,
} from '@shared/agent/skill-compile-settings'
import SkillCompilationPanel from './SkillCompilationPanel.vue'

type CompilationRow = {
  skillId: string
  name: string
  status: 'pending' | 'ready' | 'failed' | 'missing'
  source: 'bundled' | 'user' | null
  diskFingerprint: string
  storedFingerprint: string
  stale: boolean
  compiledAt: string | null
  errorMessage: string | null
  skillProvider: ProviderType
  skillModel: string
  compileProvider: ProviderType
  compileModel: string
  compileLlmSource: SkillCompileLlmSource
}

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)
const agentStore = useAgentStore()

const loading = ref(true)
const loadError = ref<string | null>(null)
const rows = ref<CompilationRow[]>([])
const busy = ref(false)
const bulkMode = ref<'load' | 'force' | null>(null)
const rowBusy = ref<string | null>(null)
const rowBusyMode = ref<'load' | 'force' | null>(null)
const bulkMessage = ref('')
const bulkError = ref(false)
const editingSkillId = ref<string | null>(null)
const panelBusy = ref(false)
const rowSettingsSaving = ref<string | null>(null)

const actionsLocked = computed(
  () =>
    loading.value ||
    busy.value ||
    Boolean(editingSkillId.value) ||
    Boolean(rowSettingsSaving.value),
)

const perSkillOverrides = reactive<SkillCompilePerSkillOverrides>({})

const rowModelCache = reactive<Record<string, string[]>>({})

function statusLabel(row: CompilationRow): string {
  if (row.stale) return p.value.skills.status.stale
  switch (row.status) {
    case 'ready':
      return p.value.skills.status.ready
    case 'pending':
      return p.value.skills.status.pending
    case 'failed':
      return p.value.skills.status.failed
    default:
      return p.value.skills.status.notLoaded
  }
}

function compileSourceLabel(row: CompilationRow): string {
  return row.compileLlmSource === 'per_skill'
    ? p.value.skills.compileSource.override
    : p.value.skills.compileSource.fromProperties
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function rowOverrideProvider(row: CompilationRow): string {
  return perSkillOverrides[row.skillId]?.provider ?? ''
}

function rowOverrideModel(row: CompilationRow): string {
  const override = perSkillOverrides[row.skillId]
  if (override) return override.model
  return row.skillModel
}

function rowModels(row: CompilationRow): string[] {
  const provider = rowOverrideProvider(row) as ProviderType
  if (!provider) return []
  return rowModelCache[row.skillId] ?? agentStore.availableModelsByProvider[provider] ?? []
}

async function loadCompileSettings(): Promise<void> {
  const values = await getSystemConfigValues(
    Object.values(SKILL_COMPILE_PROP_KEYS),
  )
  const parsed = parseSkillCompileSettings(values)
  Object.keys(perSkillOverrides).forEach((k) => delete perSkillOverrides[k])
  Object.assign(perSkillOverrides, parsed.perSkill)
}

async function savePerSkillOverrides(): Promise<void> {
  await setSystemConfigValue(
    SKILL_COMPILE_PROP_KEYS.perSkillOverrides,
    serializeSkillCompilePerSkillOverrides(perSkillOverrides),
  )
}

async function ensureRowModels(
  skillId: string,
  provider: ProviderType,
): Promise<string[]> {
  await agentStore.fetchModelsForProvider(provider)
  const models = agentStore.availableModelsByProvider[provider] ?? []
  rowModelCache[skillId] = models
  return models
}

async function onRowProviderChange(
  row: CompilationRow,
  value: string,
): Promise<void> {
  rowSettingsSaving.value = row.skillId
  try {
    if (!value) {
      delete perSkillOverrides[row.skillId]
    } else {
      const provider = value as SkillCompileProvider
      const models = await ensureRowModels(row.skillId, provider)
      const model =
        provider === row.skillProvider
          ? row.skillModel
          : models[0] ?? row.skillModel
      perSkillOverrides[row.skillId] = { provider, model }
    }
    await savePerSkillOverrides()
    await refresh()
  } finally {
    rowSettingsSaving.value = null
  }
}

async function onRowModelChange(
  row: CompilationRow,
  value: string,
): Promise<void> {
  const provider = rowOverrideProvider(row) as SkillCompileProvider
  if (!provider || !value.trim()) return
  rowSettingsSaving.value = row.skillId
  try {
    perSkillOverrides[row.skillId] = { provider, model: value.trim() }
    await savePerSkillOverrides()
    await refresh()
  } finally {
    rowSettingsSaving.value = null
  }
}

async function refresh(): Promise<void> {
  loading.value = true
  loadError.value = null
  const channel = window.ipcRendererChannel?.ListSkillCompilations
  if (!channel?.invoke) {
    loadError.value = 'ListSkillCompilations API unavailable'
    loading.value = false
    return
  }
  try {
    rows.value = (await channel.invoke()) as CompilationRow[]
    for (const row of rows.value) {
      const override = perSkillOverrides[row.skillId]
      if (override) {
        await ensureRowModels(row.skillId, override.provider as ProviderType)
      }
    }
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function compileAll(force: boolean): Promise<void> {
  const channel = window.ipcRendererChannel?.CompileAllSkills
  if (!channel?.invoke) return
  busy.value = true
  bulkMode.value = force ? 'force' : 'load'
  bulkMessage.value = ''
  bulkError.value = false
  try {
    const results = (await channel.invoke({ force })) as Array<{
      skillId: string
      status: CompilationRow['status']
      errorMessage: string | null
    }>
    const failed = results.filter((r) => r.status === 'failed')
    const ready = results.filter((r) => r.status === 'ready')
    bulkMessage.value =
      failed.length > 0
        ? `Finished: ${ready.length} ready, ${failed.length} failed.`
        : `Finished: ${ready.length} skill(s) compiled.`
    bulkError.value = failed.length > 0
    await agentStore.loadSkillsFromDisk()
    await refresh()
  } catch (err) {
    bulkMessage.value = err instanceof Error ? err.message : String(err)
    bulkError.value = true
  } finally {
    busy.value = false
    bulkMode.value = null
  }
}

function isRowLocked(row: CompilationRow): boolean {
  return (
    actionsLocked.value ||
    rowBusy.value === row.skillId ||
    rowSettingsSaving.value === row.skillId ||
    row.status === 'pending'
  )
}

function isEditDisabled(row: CompilationRow): boolean {
  return isRowLocked(row) || row.status !== 'ready'
}

function patchRowStatus(
  skillId: string,
  status: CompilationRow['status'],
): void {
  const index = rows.value.findIndex((row) => row.skillId === skillId)
  if (index < 0) return
  rows.value[index] = { ...rows.value[index]!, status }
}

async function compileOne(skillId: string, force: boolean): Promise<void> {
  const channel = window.ipcRendererChannel?.CompileSkill
  if (!channel?.invoke) return
  rowBusy.value = skillId
  rowBusyMode.value = force ? 'force' : 'load'
  patchRowStatus(skillId, 'pending')
  try {
    await channel.invoke({ skillId, force })
    await agentStore.loadSkillsFromDisk()
    await refresh()
  } finally {
    rowBusy.value = null
    rowBusyMode.value = null
  }
}

function openEditor(skillId: string): void {
  editingSkillId.value = skillId
}

function closeEditor(): void {
  editingSkillId.value = null
  panelBusy.value = false
}

function closeEditorIfIdle(): void {
  if (panelBusy.value) return
  closeEditor()
}

async function onEditorSaved(): Promise<void> {
  await agentStore.loadSkillsFromDisk()
  await refresh()
}

onMounted(async () => {
  await loadCompileSettings()
  await refresh()
})
</script>

<style scoped>
.scs-root {
  max-width: 1100px;
}

.scs-hint {
  margin: 0;
  font-size: 13px;
  color: var(--ui-text-muted);
  line-height: 1.45;
}

.scs-hint code {
  font-size: 12px;
}

.scs-select {
  font-size: 13px;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  color: var(--ui-text);
  max-width: 100%;
}

.scs-select--row {
  min-width: 140px;
  font-size: 12px;
}

.scs-select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.scs-muted {
  font-size: 12px;
  color: var(--ui-text-muted);
}

.scs-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.scs-toolbar .sp-action-btn {
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  border: 1.5px solid var(--ui-border);
  background: var(--ui-bg);
  color: var(--ui-text);
}

.scs-toolbar .sp-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.scs-toolbar .sp-action-btn--confirm {
  background: color-mix(in srgb, var(--color-primary-500) 14%, transparent);
  color: var(--color-primary-700);
  border-color: var(--color-primary-500);
}

.scs-bulk-msg {
  margin: 0;
  font-size: 13px;
  color: var(--ui-text-muted);
}
.scs-bulk-msg--error {
  color: var(--color-error, #c62828);
}

.scs-empty {
  padding: 1rem 0;
  color: var(--ui-text-muted);
  font-size: 13px;
}
.scs-empty--error {
  color: var(--color-error, #c62828);
}

.scs-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
}

.scs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.scs-table th,
.scs-table td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--ui-border);
  vertical-align: top;
}

.scs-table th {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
  background: var(--ui-bg-elevated);
}

.scs-skill-name {
  display: block;
  font-weight: 500;
  color: var(--ui-text);
}

.scs-skill-id {
  display: block;
  font-size: 11px;
  color: var(--ui-text-muted);
}

.scs-status--ready {
  color: var(--color-success, #2e7d32);
}
.scs-status--pending {
  color: var(--color-warning, #ed6c02);
}
.scs-status--failed {
  color: var(--color-error, #c62828);
}
.scs-status--missing {
  color: var(--ui-text-muted);
}

.scs-compile-llm {
  min-width: 120px;
}

.scs-compile-effective {
  display: block;
  font-size: 12px;
  font-weight: 500;
}

.scs-compile-source {
  display: block;
  font-size: 11px;
  color: var(--ui-text-muted);
}

.scs-compiled-at {
  white-space: nowrap;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.scs-row-actions {
  white-space: nowrap;
}

.scs-link-btn {
  border: none;
  background: none;
  padding: 0 0.35rem;
  font-size: 12px;
  color: var(--color-primary-500);
  cursor: pointer;
}
.scs-link-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.scs-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.45);
}

.scs-modal {
  width: min(920px, 100%);
  max-height: calc(100vh - 3rem);
  overflow: auto;
  padding: 1rem 1.25rem;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
</style>
