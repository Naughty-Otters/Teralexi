<template>
  <div class="mcp-layout">
    <!-- Left sidebar -->
    <aside class="mcp-sidebar">
      <button
        type="button"
        class="mcp-tab mcp-tab--add"
        :class="{ 'mcp-tab--active': selectedId === '__new__' }"
        @click="createNew"
      >
        <span class="mcp-tab-plus">+</span>
        <span class="mcp-tab-name">{{ p.mcp.addServer }}</span>
      </button>

      <div
        v-if="agentStore.mcpServers.length === 0 && selectedId !== '__new__'"
        class="mcp-sidebar-empty"
      >
        {{ p.mcp.noServers }}
      </div>

      <button
        v-if="selectedId === '__new__' && draft"
        type="button"
        class="mcp-tab mcp-tab--active mcp-tab--pending"
        @click="createNew"
      >
        <span class="mcp-tab-name">{{ draft.name }}</span>
        <span class="mcp-tab-badge">{{ p.mcp.unsavedDraft }}</span>
      </button>

      <button
        v-for="server in agentStore.mcpServers"
        :key="server.id"
        type="button"
        class="mcp-tab"
        :class="{
          'mcp-tab--active': selectedId === server.id,
          'mcp-tab--disabled': !server.enabled,
        }"
        @click="selectServer(server.id)"
      >
        <span
          class="mcp-tab-dot"
          :class="server.enabled ? 'mcp-tab-dot--on' : 'mcp-tab-dot--off'"
        />
        <span class="mcp-tab-name">{{ server.name }}</span>
      </button>
    </aside>

    <!-- Right pane: add form -->
    <section v-if="draft && selectedId === '__new__'" class="mcp-content mcp-section">
      <div class="mcp-section-title-row">
        <div class="mcp-title-group">
          <button
            v-if="addMode === 'registry' && registryView === 'configure'"
            type="button"
            class="mcp-back-btn"
            @click="backToRegistryBrowse"
          >
            ← {{ p.mcp.registryBackToSearch }}
          </button>
          <span class="mcp-section-title">
            {{
              addMode === 'registry' && registryView === 'configure'
                ? p.mcp.registryConfigureTitle
                : p.mcp.newServer
            }}
          </span>
        </div>

        <div class="mcp-header-controls">
          <div
            class="sp-subtabs sp-subtabs--inline"
            role="group"
            :aria-label="p.mcp.newServer"
          >
            <button
              type="button"
              class="sp-subtab"
              :class="{ 'sp-subtab--active': addMode === 'manual' }"
              @click="setAddMode('manual')"
            >
              {{ p.mcp.addModeManual }}
            </button>
            <button
              type="button"
              class="sp-subtab"
              :class="{ 'sp-subtab--active': addMode === 'registry' }"
              @click="setAddMode('registry')"
            >
              {{ p.mcp.addModeRegistry }}
            </button>
          </div>

          <button
            v-if="showConfigPanel"
            type="button"
            class="mcp-action-btn mcp-action-btn--confirm mcp-header-action"
            :disabled="!canSubmit || saving"
            @click="submitNewServer"
          >
            {{ saving ? p.mcp.addingServer : p.actions.addServer }}
          </button>
        </div>
      </div>

      <!-- Registry browse: search + results only -->
      <div
        v-if="addMode === 'registry' && registryView === 'browse'"
        class="mcp-content-body mcp-registry-browse"
      >
        <div class="mcp-field">
          <label class="mcp-label">{{ p.mcp.registrySearch }}</label>
          <input
            v-model="registrySearchQuery"
            class="mcp-input"
            :placeholder="p.mcp.registrySearchPlaceholder"
            @input="scheduleRegistrySearch"
          />
        </div>

        <p v-if="registrySearching" class="mcp-muted">
          {{ p.mcp.registrySearching }}
        </p>
        <p
          v-else-if="registrySearchQuery.trim() && registryResults.length === 0"
          class="mcp-muted"
        >
          {{ p.mcp.registryNoResults }}
        </p>
        <p
          v-else-if="registryResults.length === 0"
          class="mcp-muted"
        >
          {{ p.mcp.registrySelectServer }}
        </p>

        <div v-if="registryResults.length > 0" class="mcp-registry-results">
          <button
            v-for="server in registryResults"
            :key="`${server.name}:${server.version}`"
            type="button"
            class="mcp-registry-card"
            :class="{
              'mcp-registry-card--active':
                selectedRegistrySummary?.name === server.name,
            }"
            @click="selectRegistryServer(server)"
          >
            <span class="mcp-registry-card-title">
              {{ server.title || server.name }}
            </span>
            <span class="mcp-registry-card-meta">
              {{ server.name }} · v{{ server.version }}
            </span>
            <span
              v-if="server.description"
              class="mcp-registry-card-desc"
            >
              {{ server.description }}
            </span>
            <span
              v-if="server.transportTypes.length > 0"
              class="mcp-registry-card-tags"
            >
              <span
                v-for="transport in server.transportTypes"
                :key="transport"
                class="mcp-registry-tag"
              >
                {{ transport.toUpperCase() }}
              </span>
            </span>
          </button>
        </div>

        <button
          v-if="registryNextCursor"
          type="button"
          class="mcp-action-btn mcp-action-btn--ghost"
          :disabled="registrySearching"
          @click="loadMoreRegistryResults"
        >
          {{ p.mcp.registryLoadMore }}
        </button>

        <p v-if="errorMessage" class="mcp-error">{{ errorMessage }}</p>
      </div>

      <!-- Config panel: manual form or registry configure -->
      <div v-else-if="showConfigPanel" class="mcp-content-body">
        <div
          v-if="addMode === 'registry' && selectedRegistrySummary"
          class="mcp-registry-selected-banner"
        >
          <span class="mcp-registry-selected-name">
            {{ selectedRegistrySummary.title || selectedRegistrySummary.name }}
          </span>
          <span class="mcp-registry-selected-meta">
            {{ selectedRegistrySummary.name }} · v{{ selectedRegistrySummary.version }}
          </span>
        </div>

        <div
          v-if="addMode === 'registry' && registryDraftOptions.length > 1"
          class="mcp-field"
        >
          <label class="mcp-label">{{ p.mcp.registryConfigOption }}</label>
          <select
            v-model.number="selectedRegistryDraftIndex"
            class="mcp-input mcp-select"
            @change="applySelectedRegistryDraft"
          >
            <option
              v-for="(option, index) in registryDraftOptions"
              :key="`${option.source}-${option.transportType}-${index}`"
              :value="index"
            >
              {{ formatRegistryDraftOption(option) }}
            </option>
          </select>
        </div>

        <div class="mcp-field">
          <label class="mcp-label">{{ p.fields.name }}</label>
          <input
            v-model="draft.name"
            class="mcp-input"
            placeholder="e.g. filesystem"
          />
        </div>

        <div class="mcp-field">
          <label class="mcp-label">{{ p.fields.transport }}</label>
          <select v-model="draft.transportType" class="mcp-input mcp-select">
            <option value="http">HTTP</option>
            <option value="sse">SSE</option>
            <option value="stdio">STDIO</option>
          </select>
        </div>

        <div
          v-if="draft.transportType === 'http' || draft.transportType === 'sse'"
          class="mcp-field"
        >
          <label class="mcp-label">{{ p.fields.url }}</label>
          <input
            v-model="draft.url"
            class="mcp-input"
            placeholder="https://your-mcp-server.example.com/mcp"
          />
        </div>

        <div v-if="draft.transportType === 'stdio'" class="mcp-field">
          <label class="mcp-label">{{ p.fields.command }}</label>
          <input
            v-model="draft.command"
            class="mcp-input"
            placeholder="npx"
          />
        </div>

        <div v-if="draft.transportType === 'stdio'" class="mcp-field">
          <label class="mcp-label">{{ p.fields.args }}</label>
          <input
            v-model="draft.argsRaw"
            class="mcp-input"
            placeholder="-y, @modelcontextprotocol/server-filesystem, /tmp"
          />
        </div>

        <div
          v-if="registryTemplateFields.length > 0"
          class="mcp-registry-template-fields"
        >
          <p class="mcp-tools-heading">
            {{
              draft.transportType === 'stdio'
                ? p.mcp.registryRequiredEnv
                : p.mcp.registryRequiredHeaders
            }}
          </p>
          <div
            v-for="field in registryTemplateFields"
            :key="field.name"
            class="mcp-field"
          >
            <label class="mcp-label">
              {{ field.name }}
              <span v-if="field.isRequired" class="mcp-required">*</span>
            </label>
            <input
              v-model="registryKvValues[field.name]"
              class="mcp-input"
              :placeholder="field.placeholder || field.description || ''"
              @input="syncRegistryKvToDraft"
            />
            <span v-if="field.description" class="mcp-field-hint">
              {{ field.description }}
            </span>
          </div>
        </div>

        <div class="mcp-field">
          <label class="mcp-label">
            {{
              draft.transportType === 'stdio'
                ? p.mcp.envVars
                : p.mcp.httpHeaders
            }}
          </label>
          <textarea
            v-model="draft.kvRaw"
            class="mcp-textarea"
            rows="3"
            placeholder="Authorization: Bearer ..."
          />
        </div>

        <p v-if="errorMessage" class="mcp-error">{{ errorMessage }}</p>
      </div>
    </section>

    <!-- Right pane: selected server details -->
    <section v-else-if="selectedServer" class="mcp-content mcp-section">
      <div class="mcp-section-title-row">
        <span class="mcp-section-title">{{ selectedServer.name }}</span>
        <label
          class="sp-toggle"
          :title="selectedServer.enabled ? p.mcp.disableServer : p.mcp.enableServer"
        >
          <input
            type="checkbox"
            :checked="selectedServer.enabled"
            @change="agentStore.toggleMcpServerEnabled(selectedServer!.id)"
          />
          <span
            class="sp-toggle-track"
            :class="{ 'sp-toggle-track--on': selectedServer.enabled }"
          />
        </label>
      </div>

      <div class="mcp-content-body">
        <div class="mcp-detail-card">
          <div class="mcp-detail-row">
            <span class="mcp-detail-key">{{ p.fields.transport }}</span>
            <span class="mcp-detail-val">
              {{ selectedServer.transportType.toUpperCase() }}
            </span>
          </div>
          <div v-if="selectedServer.url" class="mcp-detail-row">
            <span class="mcp-detail-key">{{ p.fields.url }}</span>
            <span class="mcp-detail-val mcp-detail-val--mono">
              {{ selectedServer.url }}
            </span>
          </div>
          <div v-if="selectedServer.command" class="mcp-detail-row">
            <span class="mcp-detail-key">{{ p.fields.command }}</span>
            <span class="mcp-detail-val mcp-detail-val--mono">
              {{ selectedServer.command }}
            </span>
          </div>
          <div v-if="selectedServer.args.length > 0" class="mcp-detail-row">
            <span class="mcp-detail-key">{{ p.fields.args }}</span>
            <span class="mcp-detail-val mcp-detail-val--mono">
              {{ selectedServer.args.join(', ') }}
            </span>
          </div>
          <div class="mcp-detail-row">
            <span class="mcp-detail-key">{{ p.mcp.tools }}</span>
            <span class="mcp-detail-val">
              {{ (agentStore.mcpToolsByServer[selectedServer.id] ?? []).length }}
            </span>
          </div>
        </div>

        <div
          v-if="(agentStore.mcpToolsByServer[selectedServer.id] ?? []).length > 0"
          class="mcp-tools-list"
        >
          <p class="mcp-tools-heading">{{ p.mcp.availableTools }}</p>
          <div
            v-for="tool in agentStore.mcpToolsByServer[selectedServer.id]"
            :key="tool.name"
            class="mcp-tool-item"
          >
            <span class="mcp-tool-name">{{ tool.name }}</span>
            <span v-if="tool.description" class="mcp-tool-desc">
              {{ tool.description }}
            </span>
          </div>
        </div>
      </div>

      <div class="mcp-form-actions mcp-content-footer">
        <button
          type="button"
          class="mcp-action-btn mcp-action-btn--delete"
          :disabled="selectedServerIsReference"
          @click="deleteSelected"
        >
          {{ p.actions.deleteServer }}
        </button>
      </div>
    </section>

    <!-- Empty state -->
    <section v-else class="mcp-content mcp-empty">
      <span>{{ p.mcp.empty }}</span>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useAgentStore, type McpTransportType } from '@store/agent'
import { registryDraftToKvLines } from '@shared/mcp/registry-config-mapper'
import { isReferenceMcpServer } from '@shared/mcp/reference-mcp-servers'
import type {
  McpRegistryServerDraft,
  McpRegistryServerSummary,
} from '@shared/mcp/registry-types'

type McpServerDraft = {
  name: string
  transportType: McpTransportType
  url: string
  command: string
  argsRaw: string
  kvRaw: string
}

type AddMode = 'manual' | 'registry'
type RegistryView = 'browse' | 'configure'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)
const agentStore = useAgentStore()

const selectedId = ref<string | null>(null)
const draft = ref<McpServerDraft | null>(null)
const saving = ref(false)
const errorMessage = ref('')
const addMode = ref<AddMode>('manual')
const registryView = ref<RegistryView>('browse')

const registrySearchQuery = ref('')
const registryResults = ref<McpRegistryServerSummary[]>([])
const registryNextCursor = ref<string | undefined>(undefined)
const registrySearching = ref(false)
const selectedRegistrySummary = ref<McpRegistryServerSummary | null>(null)
const registryDraftOptions = ref<McpRegistryServerDraft[]>([])
const selectedRegistryDraftIndex = ref(0)
const registryKvValues = ref<Record<string, string>>({})
let registrySearchTimer: ReturnType<typeof setTimeout> | null = null

const selectedServer = computed(() =>
  selectedId.value && selectedId.value !== '__new__'
    ? (agentStore.mcpServers.find((s) => s.id === selectedId.value) ?? null)
    : null,
)

const selectedServerIsReference = computed(
  () => selectedServer.value != null && isReferenceMcpServer(selectedServer.value),
)

const selectedRegistryDraft = computed(
  () => registryDraftOptions.value[selectedRegistryDraftIndex.value] ?? null,
)

const registryTemplateFields = computed(() => {
  const selected = selectedRegistryDraft.value
  if (!selected || !draft.value) return []
  return draft.value.transportType === 'stdio'
    ? selected.envTemplate
    : selected.headersTemplate
})

const showConfigPanel = computed(
  () => addMode.value === 'manual' || registryView.value === 'configure',
)

const canSubmit = computed(() => {
  if (!draft.value) return false
  if (!draft.value.name.trim()) return false
  if (draft.value.transportType === 'stdio') {
    return Boolean(draft.value.command.trim())
  }
  return Boolean(draft.value.url.trim())
})

onMounted(() => {
  if (agentStore.mcpServers.length > 0) {
    selectServer(agentStore.mcpServers[0]!.id)
  } else {
    createNew()
  }
})

function resetRegistryState() {
  registrySearchQuery.value = ''
  registryResults.value = []
  registryNextCursor.value = undefined
  registrySearching.value = false
  selectedRegistrySummary.value = null
  registryDraftOptions.value = []
  selectedRegistryDraftIndex.value = 0
  registryKvValues.value = {}
  registryView.value = 'browse'
  if (registrySearchTimer) {
    clearTimeout(registrySearchTimer)
    registrySearchTimer = null
  }
}

function setAddMode(mode: AddMode) {
  if (addMode.value === mode) return
  addMode.value = mode
  errorMessage.value = ''
  if (mode === 'manual') {
    registryView.value = 'browse'
    return
  }
  registryView.value = 'browse'
  if (registryResults.value.length === 0) {
    void searchRegistryServers()
  }
}

function backToRegistryBrowse() {
  registryView.value = 'browse'
  errorMessage.value = ''
}

function createNew() {
  selectedId.value = '__new__'
  addMode.value = 'manual'
  registryView.value = 'browse'
  resetRegistryState()
  draft.value = {
    name: p.value.mcp.newServer,
    transportType: 'http',
    url: '',
    command: '',
    argsRaw: '',
    kvRaw: '',
  }
  errorMessage.value = ''
}

function selectServer(id: string) {
  if (!agentStore.mcpServers.some((server) => server.id === id)) return
  selectedId.value = id
  draft.value = null
  resetRegistryState()
  errorMessage.value = ''
}

function scheduleRegistrySearch() {
  if (registrySearchTimer) clearTimeout(registrySearchTimer)
  registrySearchTimer = setTimeout(() => {
    void searchRegistryServers()
  }, 350)
}

async function searchRegistryServers(append = false) {
  const channel = window.ipcRendererChannel?.SearchMcpRegistry
  if (!channel?.invoke) return

  registrySearching.value = true
  errorMessage.value = ''

  try {
    const result = await channel.invoke({
      search: registrySearchQuery.value.trim() || undefined,
      cursor: append ? registryNextCursor.value : undefined,
      limit: 20,
    })

    const servers = Array.isArray(result?.servers) ? result.servers : []
    registryResults.value = append
      ? [...registryResults.value, ...servers]
      : servers
    registryNextCursor.value = result?.nextCursor
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : p.value.mcp.registryLoadFailed
  } finally {
    registrySearching.value = false
  }
}

async function loadMoreRegistryResults() {
  if (!registryNextCursor.value || registrySearching.value) return
  await searchRegistryServers(true)
}

async function selectRegistryServer(server: McpRegistryServerSummary) {
  const channel = window.ipcRendererChannel?.GetMcpRegistryServer
  if (!channel?.invoke) return

  selectedRegistrySummary.value = server
  registryDraftOptions.value = []
  selectedRegistryDraftIndex.value = 0
  registryKvValues.value = {}
  errorMessage.value = ''
  registrySearching.value = true

  try {
    const result = await channel.invoke({
      serverName: server.name,
      version: server.version,
    })

    registryDraftOptions.value = Array.isArray(result?.drafts)
      ? result.drafts
      : []

    if (result?.preferredDraft) {
      const preferredIndex = registryDraftOptions.value.findIndex(
        (item) =>
          item.source === result.preferredDraft?.source &&
          item.transportType === result.preferredDraft?.transportType &&
          item.url === result.preferredDraft?.url &&
          item.command === result.preferredDraft?.command,
      )
      selectedRegistryDraftIndex.value = preferredIndex >= 0 ? preferredIndex : 0
    }

    applySelectedRegistryDraft()
    registryView.value = 'configure'
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : p.value.mcp.registryLoadFailed
  } finally {
    registrySearching.value = false
  }
}

function formatRegistryDraftOption(option: McpRegistryServerDraft): string {
  if (option.transportType === 'stdio') {
    const args = option.args.join(' ')
    return `${option.transportType.toUpperCase()} · ${option.command} ${args}`.trim()
  }
  return `${option.transportType.toUpperCase()} · ${option.url}`
}

function applySelectedRegistryDraft() {
  const selected = selectedRegistryDraft.value
  if (!selected || !draft.value) return

  const templates =
    selected.transportType === 'stdio'
      ? selected.envTemplate
      : selected.headersTemplate

  const nextKvValues: Record<string, string> = {}
  for (const template of templates) {
    nextKvValues[template.name] =
      registryKvValues.value[template.name] ?? template.default ?? ''
  }
  registryKvValues.value = nextKvValues

  draft.value = {
    name: selected.name,
    transportType: selected.transportType,
    url: selected.url,
    command: selected.command,
    argsRaw: selected.args.join(', '),
    kvRaw: registryDraftToKvLines(templates, nextKvValues),
  }
}

function syncRegistryKvToDraft() {
  const selected = selectedRegistryDraft.value
  if (!selected || !draft.value) return

  const templates =
    selected.transportType === 'stdio'
      ? selected.envTemplate
      : selected.headersTemplate

  draft.value.kvRaw = registryDraftToKvLines(
    templates,
    registryKvValues.value,
  )
}

function parseArgs(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseKeyValueLines(raw: string): Record<string, string> {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const mapping: Record<string, string> = {}
  for (const line of lines) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (!key) continue
    mapping[key] = value
  }
  return mapping
}

async function submitNewServer() {
  if (!draft.value || !canSubmit.value || saving.value) return

  saving.value = true
  errorMessage.value = ''
  try {
    const kv = parseKeyValueLines(draft.value.kvRaw)
    await agentStore.addMcpServer({
      name: draft.value.name.trim(),
      transportType: draft.value.transportType,
      url:
        draft.value.transportType === 'stdio'
          ? ''
          : draft.value.url.trim(),
      command:
        draft.value.transportType === 'stdio'
          ? draft.value.command.trim()
          : '',
      args:
        draft.value.transportType === 'stdio'
          ? parseArgs(draft.value.argsRaw)
          : [],
      env: draft.value.transportType === 'stdio' ? kv : {},
      headers: draft.value.transportType === 'stdio' ? {} : kv,
      enabled: true,
    })

    const added = agentStore.mcpServers[agentStore.mcpServers.length - 1]
    draft.value = null
    resetRegistryState()
    selectedId.value = added ? added.id : null
    if (!added) createNew()
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : 'Failed to add MCP server.'
  } finally {
    saving.value = false
  }
}

async function deleteSelected() {
  if (!selectedServer.value) return
  const idx = agentStore.mcpServers.findIndex(
    (s) => s.id === selectedServer.value!.id,
  )
  await agentStore.deleteMcpServer(selectedServer.value.id)
  const next = agentStore.mcpServers[idx] ?? agentStore.mcpServers[idx - 1]
  if (next) {
    selectServer(next.id)
  } else {
    createNew()
  }
}
</script>

<style scoped>
@import './sp-shared.css';

/* ── Two-pane layout ── */
.mcp-layout {
  display: flex;
  align-items: stretch;
  gap: 0;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  overflow: hidden;
}

.mcp-sidebar {
  width: 160px;
  flex-shrink: 0;
  border-right: 1px solid var(--ui-border);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 6px;
  overflow-y: auto;
}

.mcp-sidebar-empty {
  font-size: 11px;
  color: var(--ui-text-muted);
  padding: 6px 10px;
  opacity: 0.7;
}

.mcp-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: var(--ui-text);
  transition: background 0.12s;
  width: 100%;
}

.mcp-tab:hover {
  background: var(--ui-bg-accented);
}

.mcp-tab--disabled {
  opacity: 0.5;
}

.mcp-tab--pending {
  border: 1px dashed var(--color-primary-400, #818cf8);
  background: color-mix(in srgb, var(--color-primary-500, #6366f1) 8%, transparent);
}

.mcp-tab-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  color: var(--color-primary-600, #4f46e5);
  flex-shrink: 0;
}

.mcp-tab--add {
  margin-bottom: 6px;
  border-bottom: 1px solid var(--ui-border);
  border-radius: 0;
  color: var(--ui-text-muted);
  padding-bottom: 9px;
}

.mcp-tab-plus {
  font-size: 16px;
  line-height: 1;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.mcp-tab-name {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mcp-tab-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.mcp-tab-dot--on {
  background: var(--color-success-500, #22c55e);
}

.mcp-tab-dot--off {
  background: var(--ui-border);
}

/* ── Right pane ── */
.mcp-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.mcp-section {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
}

.mcp-content-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mcp-content-footer {
  flex-shrink: 0;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
}

.mcp-section-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--ui-border);
  margin-bottom: 0;
}

.mcp-title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.mcp-back-btn {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-primary-600, #4f46e5);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  line-height: 1.3;
}

.mcp-back-btn:hover {
  text-decoration: underline;
}

.mcp-header-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.mcp-registry-browse {
  gap: 10px;
}

.mcp-registry-selected-banner {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--color-primary-500) 6%, var(--ui-bg-elevated));
}

.mcp-registry-selected-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text);
}

.mcp-registry-selected-meta {
  font-size: 11px;
  color: var(--ui-text-muted);
  font-family: var(--app-font-family);
}

.mcp-muted {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.mcp-registry-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mcp-registry-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.12s,
    background 0.12s;
}

.mcp-registry-card:hover {
  border-color: var(--color-primary-400, #818cf8);
}

.mcp-registry-card--active {
  border-color: var(--color-primary-500);
  background: color-mix(in srgb, var(--color-primary-500) 8%, transparent);
}

.mcp-registry-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text);
}

.mcp-registry-card-meta {
  font-size: 11px;
  color: var(--ui-text-muted);
  font-family: var(--app-font-family);
}

.mcp-registry-card-desc {
  font-size: 12px;
  color: var(--ui-text-muted);
  line-height: 1.45;
}

.mcp-registry-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.mcp-registry-tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary-500) 12%, transparent);
  color: var(--color-primary-700);
}

.mcp-registry-template-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mcp-required {
  color: var(--color-error-600, #dc2626);
}

.mcp-field-hint {
  font-size: 11px;
  color: var(--ui-text-muted);
  line-height: 1.4;
}

.mcp-action-btn--ghost {
  align-self: flex-start;
  background: transparent;
  color: var(--ui-text-muted);
  border-color: var(--ui-border);
}

.mcp-action-btn--ghost:hover:not(:disabled) {
  background: var(--ui-bg-accented);
  color: var(--ui-text);
}

.mcp-header-action {
  flex-shrink: 0;
}

.mcp-section-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.mcp-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.mcp-error {
  margin: 0;
  font-size: 12px;
  color: var(--color-error-600, #dc2626);
}

/* ── Form fields ── */
.mcp-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.mcp-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.mcp-input,
.mcp-textarea {
  width: 100%;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  color: var(--ui-text);
  padding: 8px 12px;
  font-size: 13px;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.mcp-input:focus,
.mcp-textarea:focus {
  border-color: var(--color-primary-500);
}

.mcp-textarea {
  resize: vertical;
  line-height: 1.55;
}

.mcp-select {
  appearance: auto;
  cursor: pointer;
}

/* ── Server detail card ── */
.mcp-detail-card {
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mcp-detail-row {
  display: flex;
  gap: 12px;
  font-size: 13px;
  align-items: baseline;
}

.mcp-detail-key {
  width: 72px;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
}

.mcp-detail-val {
  color: var(--ui-text);
  word-break: break-all;
}

.mcp-detail-val--mono {
  font-family: var(--app-font-family);
  font-size: 12px;
}

/* ── Tools list ── */
.mcp-tools-list {
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mcp-tools-heading {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
}

.mcp-tool-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.mcp-tool-name {
  font-size: 12px;
  font-weight: 600;
  font-family: var(--app-font-family);
  color: var(--color-primary-500);
}

.mcp-tool-desc {
  font-size: 11px;
  color: var(--ui-text-muted);
}

/* ── Actions ── */
.mcp-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.mcp-action-btn {
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.12s,
    opacity 0.12s,
    border-color 0.12s;
  border: 1.5px solid;
}

.mcp-action-btn--confirm {
  background: color-mix(in srgb, var(--color-primary-500) 14%, transparent);
  color: var(--color-primary-700);
  border-color: var(--color-primary-500);
}

.mcp-action-btn--confirm:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary-500) 22%, transparent);
}

.mcp-action-btn--confirm:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.mcp-action-btn--delete {
  background: color-mix(
    in srgb,
    var(--color-error-500, #ef4444) 14%,
    transparent
  );
  color: var(--color-error-700, #b91c1c);
  border-color: var(--color-error-500, #ef4444);
}

.mcp-action-btn--delete:hover:not(:disabled) {
  background: color-mix(
    in srgb,
    var(--color-error-500, #ef4444) 24%,
    transparent
  );
}

.mcp-action-btn--delete:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

:global(html.dark .mcp-action-btn--delete) {
  color: var(--color-error-300, #fca5a5);
  border-color: var(--color-error-400, #f87171);
}
</style>
