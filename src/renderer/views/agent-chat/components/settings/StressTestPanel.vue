<template>
  <div class="stress-panel">
    <div class="dev-row">
      <div class="dev-row-text">
        <span class="dev-row-title">{{ labels.title }}</span>
        <span class="dev-row-desc">{{ labels.desc }}</span>
      </div>
    </div>

    <p class="stress-warn">{{ labels.warning }}</p>

    <div class="stress-fields">
      <div class="stress-field stress-field--scenarios">
        <div class="stress-scenario-header">
          <span>{{ labels.scenario }}</span>
          <div class="stress-scenario-actions">
            <button
              type="button"
              class="stress-link-btn"
              :disabled="running"
              @click="selectAllScenarios"
            >
              {{ labels.scenarioAll }}
            </button>
            <button
              type="button"
              class="stress-link-btn"
              :disabled="running"
              @click="clearScenarios"
            >
              {{ labels.scenarioNone }}
            </button>
          </div>
        </div>
        <div class="stress-checklist" role="group" :aria-label="labels.scenario">
          <label
            v-for="id in skillIds"
            :key="id"
            class="stress-check"
            :class="{ 'stress-check--disabled': running }"
          >
            <input
              type="checkbox"
              :value="id"
              :checked="selectedScenarios.includes(id)"
              :disabled="running"
              @change="toggleScenario(id, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ id }}</span>
          </label>
        </div>
      </div>

      <label class="stress-field">
        <span>{{ labels.duration }}</span>
        <select v-model="durationPreset" :disabled="running" class="stress-select">
          <option value="2m">2m (smoke)</option>
          <option value="30m">30m</option>
          <option value="2h">2h</option>
          <option value="10h">10h</option>
          <option value="custom">{{ labels.custom }}</option>
        </select>
      </label>

      <label v-if="durationPreset === 'custom'" class="stress-field">
        <span>{{ labels.customDuration }}</span>
        <input
          v-model="customDuration"
          class="stress-input"
          :disabled="running"
          placeholder="e.g. 15m"
        />
      </label>

      <label class="stress-field">
        <span>{{ labels.inputMode }}</span>
        <select v-model="inputMode" :disabled="running" class="stress-select">
          <option value="hybrid">{{ labels.modeHybrid }}</option>
          <option value="cycle">{{ labels.modeCycle }}</option>
          <option value="ai-continue">{{ labels.modeAi }}</option>
        </select>
      </label>

      <label class="stress-field">
        <span>{{ labels.concurrency }}</span>
        <select v-model="concurrencyMode" :disabled="running" class="stress-select">
          <option value="sequential">{{ labels.concurrencySequential }}</option>
          <option value="concurrent">{{ labels.concurrencyConcurrent }}</option>
        </select>
      </label>
    </div>

    <div class="stress-actions">
      <button
        type="button"
        class="stress-btn stress-btn--primary"
        :disabled="running || starting || selectedScenarios.length === 0"
        @click="onStart"
      >
        {{ running ? labels.running : labels.start }}
      </button>
      <button
        type="button"
        class="stress-btn"
        :disabled="!stopEnabled"
        @click="onStop"
      >
        {{ labels.stop }}
      </button>
      <button
        type="button"
        class="stress-btn"
        :disabled="!canOpenReport"
        @click="onOpenReport"
      >
        {{ labels.openReport }}
      </button>
    </div>

    <div v-if="status.running || status.turnIndex > 0" class="stress-live">
      <div>{{ labels.elapsed }}: {{ formatMs(status.elapsedMs) }} / {{ formatMs(status.elapsedMs + status.remainingMs) }}</div>
      <div>{{ labels.skill }}: {{ status.currentSkillId ?? '—' }} · {{ labels.turn }} #{{ status.turnIndex }}</div>
      <div>
        FPS {{ status.fps?.avg?.toFixed?.(0) ?? '—' }}
        (min {{ status.fps?.min?.toFixed?.(0) ?? '—' }})
        · RSS {{ formatBytes(status.rss) }}
        · {{ labels.latency }} {{ status.lastLatencyMs != null ? `${status.lastLatencyMs}ms` : '—' }}
      </div>
      <div v-if="status.lastError" class="stress-error">{{ status.lastError }}</div>
      <div v-if="summaryLine" class="stress-summary">{{ summaryLine }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  STRESS_SKILL_IDS,
  parseStressDurationMs,
  type StressConcurrencyMode,
  type StressInputMode,
  type StressLiveStatus,
  type StressRunSummary,
  type StressSkillId,
} from '@shared/stress-test'
import { useGoogleWorkspaceAccount } from '@renderer/composables/useGoogleWorkspaceAccount'
import { getStressTestRunner } from '../../stress/StressTestRunner'
import {
  loadStressPanelSettings,
  saveStressPanelSettings,
} from '../../stress/stressPanelPreferences'

const props = defineProps<{
  labels: {
    title: string
    desc: string
    warning: string
    scenario: string
    scenarioAll: string
    scenarioNone: string
    duration: string
    custom: string
    customDuration: string
    inputMode: string
    modeHybrid: string
    modeCycle: string
    modeAi: string
    concurrency: string
    concurrencySequential: string
    concurrencyConcurrent: string
    start: string
    stop: string
    running: string
    openReport: string
    elapsed: string
    skill: string
    turn: string
    latency: string
  }
  defaultDurationMs: number
}>()

const persisted = loadStressPanelSettings()

const skillIds = STRESS_SKILL_IDS
const selectedScenarios = ref<StressSkillId[]>(
  persisted?.selectedScenarios ?? [...STRESS_SKILL_IDS],
)
const durationPreset = ref(persisted?.durationPreset ?? '2m')
const customDuration = ref(persisted?.customDuration ?? '15m')
const inputMode = ref<StressInputMode>(persisted?.inputMode ?? 'hybrid')
const concurrencyMode = ref<StressConcurrencyMode>(
  persisted?.concurrencyMode ?? 'sequential',
)

function toggleScenario(id: StressSkillId, checked: boolean): void {
  const set = new Set(selectedScenarios.value)
  if (checked) set.add(id)
  else set.delete(id)
  selectedScenarios.value = STRESS_SKILL_IDS.filter((s) => set.has(s))
}

function selectAllScenarios(): void {
  selectedScenarios.value = [...STRESS_SKILL_IDS]
}

function clearScenarios(): void {
  selectedScenarios.value = []
}

function persistPanelSettings(): void {
  saveStressPanelSettings({
    selectedScenarios: selectedScenarios.value,
    durationPreset: durationPreset.value,
    customDuration: customDuration.value,
    inputMode: inputMode.value,
    concurrencyMode: concurrencyMode.value,
  })
}

watch(
  [selectedScenarios, durationPreset, customDuration, inputMode, concurrencyMode],
  () => {
    persistPanelSettings()
  },
  { deep: true },
)
const running = ref(false)
const starting = ref(false)
/** Bumped so canOpenReport re-reads runner/sessionStorage after async run events. */
const reportEpoch = ref(0)
const lastReportDir = ref<string | null>(null)
const summaryLine = ref('')
const status = ref<StressLiveStatus>({
  running: false,
  runId: null,
  elapsedMs: 0,
  remainingMs: 0,
  currentSkillId: null,
  turnIndex: 0,
  lastLatencyMs: null,
  fps: null,
  rss: null,
  reportDir: null,
  lastError: null,
})

const { hasWorkspaceAccess } = useGoogleWorkspaceAccount()

const canOpenReport = computed(() => {
  void reportEpoch.value
  const dir =
    lastReportDir.value?.trim() ||
    status.value.reportDir?.trim() ||
    getStressTestRunner().getLastReportDir()?.trim() ||
    ''
  return dir.length > 0
})

function syncReportFromRunner(): void {
  const runner = getStressTestRunner()
  const dir = runner.getLastReportDir()
  if (dir) lastReportDir.value = dir
  const summary = runner.getLastSummary()
  if (summary) summaryLine.value = formatSummary(summary)
  reportEpoch.value++
}

onMounted(() => {
  // Env default duration only applies when the user has no saved preset yet.
  if (!persisted) {
    const ms = props.defaultDurationMs
    if (ms === 30 * 60_000) durationPreset.value = '30m'
    else if (ms === 2 * 3_600_000) durationPreset.value = '2h'
    else if (ms === 10 * 3_600_000) durationPreset.value = '10h'
    else if (ms === 120_000) durationPreset.value = '2m'
    else {
      durationPreset.value = 'custom'
      customDuration.value = `${Math.round(ms / 60_000)}m`
    }
  }

  syncReportFromRunner()

  // Start switches to Chat (Settings unmounts). Re-attach if user returns mid-run.
  const runner = getStressTestRunner()
  const bindLiveStatus = () => {
    running.value = true
    status.value = runner.getLiveStatus()
    syncReportFromRunner()
    runner.setOnStatus((s) => {
      status.value = s
      if (s.reportDir) lastReportDir.value = s.reportDir
      reportEpoch.value++
      if (!s.running) {
        running.value = false
        syncReportFromRunner()
      }
    })
  }
  if (runner.isRunning()) bindLiveStatus()

  // Keep Stop enabled / status fresh while Settings is open during a soak.
  const syncTimer = setInterval(() => {
    const r = getStressTestRunner()
    if (r.isRunning()) {
      if (!running.value) bindLiveStatus()
      else status.value = r.getLiveStatus()
    } else if (running.value) {
      running.value = false
      syncReportFromRunner()
    }
  }, 400)

  onUnmounted(() => {
    clearInterval(syncTimer)
    // Do not stop the soak when Settings closes — ChatPanel must remount for turns.
    getStressTestRunner().setOnStatus(null)
  })
})

function resolveDurationMs(): number {
  if (durationPreset.value === 'custom') {
    return parseStressDurationMs(customDuration.value) ?? 120_000
  }
  return parseStressDurationMs(durationPreset.value) ?? 120_000
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function formatBytes(n: number | null): string {
  if (n == null || n <= 0) return '—'
  const mb = n / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`
}

function formatSummary(summary: StressRunSummary): string {
  return `Done (${summary.stoppedBy}): ${summary.turns} turns, ${summary.errors} errors, p50 ${summary.latencyMs.p50}ms, peak RSS ${(summary.peakRss / (1024 * 1024)).toFixed(0)}MB`
}

async function onStart(): Promise<void> {
  if (running.value || starting.value) return
  if (selectedScenarios.value.length === 0) {
    status.value.lastError = 'Select at least one scenario'
    return
  }
  starting.value = true
  summaryLine.value = ''
  status.value.lastError = null
  try {
    running.value = true
    const summary = await getStressTestRunner().start({
      scenarioFilter: [...selectedScenarios.value],
      inputMode: inputMode.value,
      concurrencyMode: concurrencyMode.value,
      durationMs: resolveDurationMs(),
      googleWorkspaceAuthenticated: hasWorkspaceAccess.value,
      onStatus: (s) => {
        status.value = s
        if (s.reportDir) {
          lastReportDir.value = s.reportDir
          reportEpoch.value++
        }
      },
    })
    syncReportFromRunner()
    if (summary) {
      lastReportDir.value = summary.reportDir
      summaryLine.value = formatSummary(summary)
      reportEpoch.value++
    }
  } catch (err) {
    status.value.lastError =
      err instanceof Error ? err.message : String(err)
    syncReportFromRunner()
  } finally {
    running.value = false
    starting.value = false
  }
}

function onStop(): void {
  const runner = getStressTestRunner()
  runner.stop()
  // Reflect immediately — wait loop may be paused without a live status tick.
  status.value = runner.getLiveStatus()
  if (!runner.isRunning()) {
    running.value = false
    syncReportFromRunner()
  }
}

const stopEnabled = computed(
  () =>
    running.value ||
    starting.value ||
    status.value.running ||
    getStressTestRunner().isRunning(),
)

async function onOpenReport(): Promise<void> {
  const dir =
    lastReportDir.value?.trim() ||
    getStressTestRunner().getLastReportDir()?.trim() ||
    ''
  if (!dir) return
  await window.ipcRendererChannel?.OpenStressReportFolder?.invoke?.({
    reportDir: dir,
  })
}
</script>

<style scoped>
.stress-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stress-warn {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-warning, #b45309);
}
.stress-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.stress-field--scenarios {
  grid-column: 1 / -1;
}
.stress-scenario-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.stress-scenario-actions {
  display: flex;
  gap: 8px;
}
.stress-link-btn {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 12px;
  color: var(--ui-accent, #2563eb);
  cursor: pointer;
}
.stress-link-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.stress-checklist {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 6px 12px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #d4d4d8);
  background: var(--ui-bg, #fff);
}
.stress-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ui-text);
  cursor: pointer;
  user-select: none;
}
.stress-check--disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.stress-check input {
  margin: 0;
}
.stress-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
.stress-select,
.stress-input {
  font-size: 13px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #d4d4d8);
  background: var(--ui-bg, #fff);
  color: var(--ui-text);
}
.stress-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.stress-btn {
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #d4d4d8);
  background: var(--ui-bg-elevated, #f4f4f5);
  color: var(--ui-text);
  cursor: pointer;
}
.stress-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.stress-btn--primary {
  background: var(--ui-accent, #2563eb);
  border-color: transparent;
  color: #fff;
}
.stress-live {
  font-size: 12px;
  line-height: 1.5;
  color: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
}
.stress-error {
  color: var(--ui-danger, #dc2626);
}
.stress-summary {
  margin-top: 4px;
  color: var(--ui-text);
}
@media (max-width: 640px) {
  .stress-fields {
    grid-template-columns: 1fr;
  }
}
</style>
