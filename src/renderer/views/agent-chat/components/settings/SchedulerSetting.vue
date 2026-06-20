<template>
  <div class="sch-layout">
    <aside class="sch-sidebar">
      <button
        class="sch-tab sch-tab--add"
        :class="{ 'sch-tab--active': selectedId === '__new__' }"
        @click="createNew"
      >
        <span class="sch-tab-plus">+</span>
        <span class="sch-tab-name">{{ p.scheduler.addSchedule }}</span>
      </button>

      <div v-if="loading" class="sch-sidebar-empty">{{ p.scheduler.loadingSchedules }}</div>
      <div
        v-else-if="schedulers.length === 0 && selectedId !== '__new__'"
        class="sch-sidebar-empty"
      >
        {{ p.scheduler.noSchedules }}
      </div>

      <button
        v-if="selectedId === '__new__' && draft"
        type="button"
        class="sch-tab sch-tab--active sch-tab--pending"
        @click="createNew"
      >
        <span class="sch-tab-name">{{ draft.name }}</span>
        <span class="sch-tab-badge">{{ p.scheduler.unsavedDraft }}</span>
      </button>

      <button
        v-for="item in schedulers"
        :key="item.id"
        type="button"
        class="sch-tab"
        :class="{
          'sch-tab--active': selectedId === item.id,
          'sch-tab--disabled': !item.enabled,
        }"
        @click="select(item.id)"
      >
        <span class="sch-tab-name">{{ item.name }}</span>
      </button>
    </aside>

    <section v-if="draft" class="sch-content sp-section">
      <div class="sp-section-title-row">
        <span class="sp-section-title">
          {{ selectedId === '__new__' ? p.scheduler.newSchedule : p.scheduler.editSchedule }}
        </span>
        <button
          v-if="selectedId === '__new__'"
          type="button"
          class="sp-action-btn sp-action-btn--confirm sch-header-save"
          :disabled="saving"
          @click="saveDraft"
        >
          {{ saving ? p.scheduler.saving : p.actions.saveSchedule }}
        </button>
      </div>

      <div class="sch-content-body">
      <label class="sp-field">
        <span class="sp-label">{{ p.fields.name }}</span>
        <input
          v-model.trim="draft.name"
          class="sp-input"
          placeholder="Morning WhatsApp Ping"
        />
      </label>

      <div class="sp-field">
        <span class="sp-label">{{ p.fields.enabled }}</span>
        <label
          class="sp-toggle"
          :title="draft.enabled ? 'Disable schedule' : 'Enable schedule'"
        >
          <input v-model="draft.enabled" type="checkbox" />
          <span
            class="sp-toggle-track"
            :class="{ 'sp-toggle-track--on': draft.enabled }"
          />
        </label>
      </div>

      <label class="sp-field">
        <span class="sp-label">{{ p.fields.scheduleType }}</span>
        <select v-model="draft.scheduleType" class="sp-input sp-select">
          <option value="interval">{{ p.scheduler.interval }}</option>
          <option value="cron">{{ p.scheduler.cron }}</option>
        </select>
      </label>

      <label v-if="draft.scheduleType === 'interval'" class="sp-field">
        <span class="sp-label">{{ p.fields.intervalMs }}</span>
        <input
          v-model.number="draftIntervalMinutes"
          class="sp-input"
          type="number"
          min="1"
          step="1"
          placeholder="60"
        />
      </label>

      <label v-else class="sp-field">
        <span class="sp-label">{{ p.fields.cronExpression }}</span>
        <input
          v-model.trim="draft.cronExpression"
          class="sp-input sp-key-input"
          placeholder="0 */5 * * * *"
        />
      </label>

      <label v-if="draft.scheduleType === 'cron'" class="sp-field">
        <span class="sp-label">{{ p.fields.timezone }}</span>
        <input
          v-model.trim="draft.timezone"
          class="sp-input"
          placeholder="UTC"
        />
      </label>

      <label class="sp-field">
        <span class="sp-label">{{ p.fields.action }}</span>
        <select v-model="draft.actionType" class="sp-input sp-select">
          <option value="send-channel-message">{{ p.scheduler.sendChannelMessage }}</option>
          <option value="run-agent">{{ p.scheduler.runAgent }}</option>
        </select>
      </label>

      <label
        v-if="draft.actionType === 'send-channel-message'"
        class="sp-field"
      >
        <span class="sp-label">{{ p.fields.channelId }}</span>
        <input
          v-model.trim="draft.channelId"
          class="sp-input"
          placeholder="whatsapp"
        />
      </label>

      <label
        v-if="draft.actionType === 'send-channel-message'"
        class="sp-field"
      >
        <span class="sp-label">{{ p.fields.target }}</span>
        <input
          v-model.trim="draft.target"
          class="sp-input"
          placeholder="15551234567@s.whatsapp.net"
        />
      </label>

      <label
        v-if="draft.actionType === 'send-channel-message'"
        class="sp-field"
      >
        <span class="sp-label">{{ p.fields.message }}</span>
        <textarea
          v-model="draft.message"
          class="sp-textarea"
          rows="3"
          placeholder="Scheduled message"
        />
      </label>

      <label v-if="draft.actionType === 'run-agent'" class="sp-field">
        <span class="sp-label">{{ p.fields.agentId }}</span>
        <select v-model="draft.agentId" class="sp-input sp-select">
          <option value="" disabled>
            {{
              agentOptions.length > 0
                ? p.scheduler.selectAgent
                : p.scheduler.noAgents
            }}
          </option>
          <option
            v-for="agent in agentOptions"
            :key="agent.id"
            :value="agent.id"
          >
            {{ agent.name }} ({{ agent.id }})
          </option>
          <option
            v-if="
              draft.agentId &&
              !agentOptions.some((agent) => agent.id === draft.agentId)
            "
            :value="draft.agentId"
          >
            {{ draft.agentId }} {{ p.scheduler.agentMissing }}
          </option>
        </select>
      </label>

      <label v-if="draft.actionType === 'run-agent'" class="sp-field">
        <span class="sp-label">{{ p.fields.conversationId }}</span>
        <input
          v-model.trim="draft.conversationId"
          class="sp-input"
          placeholder="scheduler:daily-agent-run"
        />
      </label>

      <label v-if="draft.actionType === 'run-agent'" class="sp-field">
        <span class="sp-label">{{ p.fields.prompt }}</span>
        <textarea
          v-model="draft.prompt"
          class="sp-textarea"
          rows="4"
          placeholder="Run a daily summary over yesterday's conversations."
        />
      </label>

      <p v-if="errorMessage" class="sch-error">{{ errorMessage }}</p>
      </div>

      <div v-if="selectedId !== '__new__'" class="sp-form-actions sch-content-footer">
        <button
          type="button"
          class="sp-action-btn sp-action-btn--delete"
          @click="removeSelected"
        >
          {{ p.actions.delete }}
        </button>
        <button
          type="button"
          class="sp-action-btn sp-action-btn--confirm"
          :disabled="saving"
          @click="saveDraft"
        >
          {{ saving ? p.scheduler.saving : p.actions.saveSchedule }}
        </button>
      </div>
    </section>

    <section v-else class="sch-content sch-empty">
      <span>{{ p.scheduler.empty }}</span>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { DEFAULT_USER_ID } from '@store/agent/config'
import { useAgentStore } from '@store/agent'

type SchedulerDefinition = {
  id: string
  userId: string
  name: string
  enabled: boolean
  scheduleType: 'interval' | 'cron'
  intervalMs: number | null
  cronExpression: string | null
  timezone: string | null
  actionType: 'send-channel-message' | 'run-agent'
  channelId: string
  target: string
  message: string
  agentId: string
  conversationId: string
  prompt: string
  workflowId: string
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
}

type SchedulerUpsertPayload = Omit<
  SchedulerDefinition,
  'lastRunAt' | 'createdAt' | 'updatedAt'
>

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)

const MS_PER_MINUTE = 60_000

const schedulers = ref<SchedulerDefinition[]>([])
const selectedId = ref<string | null>(null)
const draft = ref<SchedulerUpsertPayload | null>(null)
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const agentStore = useAgentStore()

const agentOptions = computed(() =>
  agentStore.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
  })),
)

const selected = computed(
  () => schedulers.value.find((item) => item.id === selectedId.value) ?? null,
)

const draftIntervalMinutes = computed({
  get: () => {
    const ms = draft.value?.intervalMs
    if (ms == null || ms <= 0) return 1
    return ms / MS_PER_MINUTE
  },
  set: (minutes: number) => {
    if (!draft.value) return
    const normalized = Number.isFinite(minutes) && minutes > 0 ? minutes : 1
    draft.value.intervalMs = Math.round(normalized * MS_PER_MINUTE)
  },
})

function defaultAgentId(): string {
  const enabled = agentStore.agents.find((agent) => agent.enabled)
  return enabled?.id ?? agentStore.agents[0]?.id ?? ''
}

function ensureDraftIntervalMs(): void {
  if (!draft.value || draft.value.scheduleType !== 'interval') return
  if (!draft.value.intervalMs || draft.value.intervalMs < MS_PER_MINUTE) {
    draft.value.intervalMs = MS_PER_MINUTE
  }
}

onMounted(async () => {
  await loadSchedulers()
  if (schedulers.value.length > 0) {
    select(schedulers.value[0].id)
  } else {
    createNew()
  }
})

async function loadSchedulers() {
  loading.value = true
  try {
    const channel = window.ipcRendererChannel?.ListSchedulers
    const result = channel?.invoke
      ? await channel.invoke({ userId: DEFAULT_USER_ID })
      : []
    schedulers.value = Array.isArray(result) ? result : []
  } finally {
    loading.value = false
  }
}

function select(id: string) {
  const current = schedulers.value.find((item) => item.id === id)
  if (!current) return
  selectedId.value = current.id
  draft.value = {
    id: current.id,
    userId: current.userId,
    name: current.name,
    enabled: current.enabled,
    scheduleType: current.scheduleType,
    intervalMs: current.intervalMs,
    cronExpression: current.cronExpression,
    timezone: current.timezone,
    actionType: current.actionType,
    channelId: current.channelId,
    target: current.target,
    message: current.message,
    agentId: current.agentId,
    conversationId: current.conversationId,
    prompt: current.prompt,
    workflowId: current.workflowId ?? '',
  }
  errorMessage.value = ''
}

function createNew() {
  const id = `sch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const agentId = defaultAgentId()
  const next: SchedulerUpsertPayload = {
    id,
    userId: DEFAULT_USER_ID,
    name: p.value.scheduler.newSchedule,
    enabled: true,
    scheduleType: 'interval',
    intervalMs: MS_PER_MINUTE,
    cronExpression: null,
    timezone: null,
    actionType: agentId ? 'run-agent' : 'send-channel-message',
    channelId: 'whatsapp',
    target: '',
    message: '',
    agentId,
    conversationId: '',
    prompt: agentId ? 'Run scheduled task.' : '',
    workflowId: '',
  }
  selectedId.value = '__new__'
  draft.value = next
  errorMessage.value = ''
}

function formatIntervalMinutes(intervalMs: number | null): string {
  const ms = intervalMs ?? 0
  if (ms <= 0) return '0 min'
  const mins = ms / MS_PER_MINUTE
  const rounded =
    Number.isInteger(mins) ? mins : Math.round(mins * 10) / 10
  return `${rounded} min`
}

function scheduleSummary(item: SchedulerDefinition): string {
  if (item.scheduleType === 'interval') {
    return `Every ${formatIntervalMinutes(item.intervalMs)}`
  }
  const tz = item.timezone?.trim()
  return tz ? `${item.cronExpression} (${tz})` : `${item.cronExpression}`
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function validate(payload: SchedulerUpsertPayload): string {
  if (!payload.name.trim()) return 'Name is required.'
  if (payload.scheduleType === 'interval') {
    if (!payload.intervalMs || payload.intervalMs < MS_PER_MINUTE) {
      return 'Interval must be at least 1 minute.'
    }
  }
  if (payload.scheduleType === 'cron' && !payload.cronExpression?.trim()) {
    return 'Cron expression is required for cron schedules.'
  }
  if (payload.actionType === 'send-channel-message') {
    if (!payload.channelId.trim()) return 'Channel Id is required.'
    if (!payload.target.trim()) return 'Target is required.'
    if (!payload.message.trim()) return 'Message is required.'
  }
  if (payload.actionType === 'run-agent') {
    if (!payload.agentId.trim()) return 'Agent Id is required.'
    if (!payload.prompt.trim()) return 'Prompt is required.'
  }
  return ''
}

async function saveDraft() {
  if (!draft.value) return
  ensureDraftIntervalMs()

  const payload: SchedulerUpsertPayload = {
    ...draft.value,
    name: draft.value.name.trim(),
    intervalMs:
      draft.value.scheduleType === 'interval'
        ? Number(draft.value.intervalMs ?? 0)
        : null,
    cronExpression:
      draft.value.scheduleType === 'cron'
        ? (draft.value.cronExpression ?? '').trim() || null
        : null,
    timezone:
      draft.value.scheduleType === 'cron'
        ? (draft.value.timezone ?? '').trim() || null
        : null,
    channelId: draft.value.channelId.trim(),
    target: draft.value.target.trim(),
    message: draft.value.message.trim(),
    agentId: draft.value.agentId.trim(),
    conversationId: draft.value.conversationId.trim(),
    prompt: draft.value.prompt.trim(),
    workflowId: (draft.value.workflowId ?? '').trim(),
  }

  const validationMessage = validate(payload)
  if (validationMessage) {
    errorMessage.value = validationMessage
    return
  }

  saving.value = true
  errorMessage.value = ''
  try {
    const channel = window.ipcRendererChannel?.UpsertScheduler
    if (!channel?.invoke) {
      errorMessage.value = 'Scheduler storage is unavailable.'
      return
    }
    await channel.invoke(payload)
    await loadSchedulers()
    const saved = schedulers.value.find((item) => item.id === payload.id)
    if (!saved) {
      errorMessage.value = 'Schedule saved but failed to reload the list.'
      return
    }
    select(saved.id)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Failed to save schedule.'
  } finally {
    saving.value = false
  }
}

async function removeSelected() {
  if (!selected.value) return
  const deletingId = selected.value.id
  const channel = window.ipcRendererChannel?.DeleteScheduler
  if (channel?.invoke) {
    await channel.invoke({ userId: DEFAULT_USER_ID, schedulerId: deletingId })
  }

  await loadSchedulers()
  if (schedulers.value.length > 0) {
    select(schedulers.value[0].id)
  } else {
    selectedId.value = null
    draft.value = null
  }
}
</script>

<style scoped>
@import './sp-shared.css';

.sch-layout {
  display: flex;
  align-items: stretch;
  gap: 0;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  overflow: hidden;
}

.sch-sidebar {
  width: 170px;
  flex-shrink: 0;
  border-right: 1px solid var(--ui-border);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 6px;
  overflow-y: auto;
}

.sch-sidebar-empty {
  font-size: 11px;
  color: var(--ui-text-muted);
  padding: 6px 10px;
  opacity: 0.7;
}

.sch-tab {
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

.sch-tab:hover {
  background: var(--ui-bg-accented);
}

.sch-tab--disabled {
  opacity: 0.5;
}

.sch-tab--pending {
  border: 1px dashed var(--color-primary-400, #818cf8);
  background: color-mix(in srgb, var(--color-primary-500, #6366f1) 8%, transparent);
}

.sch-tab-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  color: var(--color-primary-600, #4f46e5);
  flex-shrink: 0;
}

.sp-section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  padding: 16px 16px 0;
}

.sch-header-save {
  flex-shrink: 0;
}

.sch-tab--add {
  margin-bottom: 6px;
  border-bottom: 1px solid var(--ui-border);
  border-radius: 0;
  color: var(--ui-text-muted);
  padding-bottom: 9px;
}

.sch-tab-plus {
  font-size: 16px;
  line-height: 1;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.sch-tab-name {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sch-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.sch-content-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sch-content-footer {
  margin-top: 0;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
}

.sp-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.sp-action-btn {
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

.sp-action-btn--cancel {
  background: transparent;
  color: var(--ui-text-muted);
  border-color: var(--ui-border);
}

.sp-action-btn--cancel:hover {
  background: var(--ui-bg-accented);
  color: var(--ui-text);
  border-color: var(--ui-text-muted);
}

.sp-action-btn--confirm {
  background: color-mix(in srgb, var(--color-primary-500) 14%, transparent);
  color: var(--color-primary-700);
  border-color: var(--color-primary-500);
}

.sp-action-btn--confirm:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary-500) 24%, transparent);
}

.sp-action-btn--confirm:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

:global(html.dark .sp-action-btn--confirm) {
  color: var(--color-primary-300);
  border-color: var(--color-primary-400);
}

.sp-action-btn--delete {
  background: color-mix(
    in srgb,
    var(--color-error-500, #ef4444) 14%,
    transparent
  );
  color: var(--color-error-700, #b91c1c);
  border-color: var(--color-error-500, #ef4444);
}

.sp-action-btn--delete:hover {
  background: color-mix(
    in srgb,
    var(--color-error-500, #ef4444) 24%,
    transparent
  );
}

.sp-action-btn--delete:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

:global(html.dark .sp-action-btn--delete) {
  color: var(--color-error-300, #fca5a5);
  border-color: var(--color-error-400, #f87171);
}

.sch-error {
  margin: 0;
  font-size: 12px;
  color: var(--color-error-500, #ef4444);
}

.sch-empty {
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted);
  font-size: 12px;
}
</style>
