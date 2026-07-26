import { nextTick } from 'vue'
import { randomShortUuid } from '@shared/utils/short-uuid'
import {
  buildAiContinueGeneratorPrompt,
  getStressScenariosForFilter,
} from '@shared/stress-test'
import type {
  StressConcurrencyMode,
  StressInputMode,
  StressLiveStatus,
  StressRunConfig,
  StressRunSummary,
  StressScenario,
  StressScenarioFilter,
  StressSkillId,
  StressTurnRecord,
} from '@shared/stress-test/types'
import { useAgentStore } from '@store/agent'
import { createLogger } from '@renderer/utils/logger'
import { StressMetricsCollector } from './StressMetricsCollector'
import {
  ensureStressChatView,
  getStressChatDriver,
  waitForStressChatReady,
} from './stressChatBridge'

const log = createLogger('stress-test.runner')

export type StressRunnerStartOptions = {
  scenarioFilter: StressScenarioFilter
  inputMode: StressInputMode
  concurrencyMode: StressConcurrencyMode
  durationMs: number
  /** When false, skip google prompts that require auth. Default true. */
  googleWorkspaceAuthenticated?: boolean
  onStatus?: (status: StressLiveStatus) => void
}

type SkillCursor = {
  scenario: StressScenario
  conversationId: string
  promptIndex: number
  scriptedExhausted: boolean
  turnCount: number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  )
  return sorted[idx]!
}

function stripGeneratedPrompt(raw: string): string {
  let text = raw.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '')
  }
  const firstLine = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  return (firstLine ?? text).replace(/^["']|["']$/g, '').trim()
}

/**
 * Multi-skill soak runner. Sequential round-robin or concurrent per-skill loops.
 */
export class StressTestRunner {
  private abort = false
  private running = false
  private metrics = new StressMetricsCollector()
  private status: StressLiveStatus = idleStatus()
  private onStatus: ((s: StressLiveStatus) => void) | null = null
  private latencies: number[] = []
  private fpsAvgs: number[] = []
  private fpsMins: number[] = []
  private fpsLows: number[] = []
  private peakRss = 0
  private skillCounts: Partial<Record<StressSkillId, number>> = {}
  private errorCount = 0
  private turnIndex = 0
  private reportDir: string | null = null
  private runId: string | null = null
  private startedAtMs = 0
  private plannedDurationMs = 0
  private statusTimer: ReturnType<typeof setInterval> | null = null
  private currentSkillId: StressSkillId | null = null
  /** Conversations created for this run. */
  private conversationIds: string[] = []
  /** Conversations currently mid-turn (one for sequential; many for concurrent). */
  private activeConversationIds = new Set<string>()
  private lastReportDir: string | null = null
  private lastSummary: StressRunSummary | null = null

  getLiveStatus(): StressLiveStatus {
    return { ...this.status }
  }

  getLastReportDir(): string | null {
    const mem = (this.lastReportDir ?? this.reportDir)?.trim() || null
    if (mem) return mem
    return readPersistedLastReportDir()
  }

  getLastSummary(): StressRunSummary | null {
    return this.lastSummary ?? readPersistedLastSummary()
  }

  /** Restore report path after Settings remount or module reload. */
  hydrateLastReport(
    reportDir: string,
    summary?: StressRunSummary | null,
  ): void {
    const trimmed = reportDir.trim()
    if (!trimmed) return
    this.lastReportDir = trimmed
    if (!this.reportDir) this.reportDir = trimmed
    if (summary) this.lastSummary = summary
    persistLastReportDir(trimmed)
    if (summary) persistLastSummary(summary)
  }

  isRunning(): boolean {
    return this.running
  }

  stop(): void {
    if (!this.running) return
    this.abort = true
    const driver = getStressChatDriver()
    const ids =
      this.activeConversationIds.size > 0
        ? [...this.activeConversationIds]
        : this.conversationIds
    for (const conversationId of ids) {
      driver?.stopConversation(conversationId)
      void window.ipcRendererChannel?.StopAgentForConversation?.invoke?.({
        conversationId,
      })
    }
    driver?.stopCurrentTurn()
    this.emitStatus()
  }

  /** Re-bind live status updates after Settings remounts mid-run. */
  setOnStatus(cb: ((s: StressLiveStatus) => void) | null): void {
    this.onStatus = cb
    if (cb) cb(this.getLiveStatus())
  }

  async start(opts: StressRunnerStartOptions): Promise<StressRunSummary | null> {
    if (this.running) throw new Error('Stress test already running')
    this.abort = false
    this.running = true
    this.onStatus = opts.onStatus ?? null
    this.latencies = []
    this.fpsAvgs = []
    this.fpsMins = []
    this.fpsLows = []
    this.peakRss = 0
    this.skillCounts = {}
    this.errorCount = 0
    this.turnIndex = 0
    this.conversationIds = []
    this.activeConversationIds = new Set()
    this.lastSummary = null

    const runId = `stress-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomShortUuid().slice(0, 6)}`
    this.runId = runId
    this.plannedDurationMs = opts.durationMs
    this.startedAtMs = Date.now()

    const scenarios = getStressScenariosForFilter(opts.scenarioFilter)
    const skillIds = scenarios.map((s) => s.skillId)
    const concurrencyMode: StressConcurrencyMode =
      opts.concurrencyMode === 'concurrent' ? 'concurrent' : 'sequential'
    const config: StressRunConfig = {
      runId,
      scenarioFilter: opts.scenarioFilter,
      inputMode: opts.inputMode,
      concurrencyMode,
      durationMs: opts.durationMs,
      startedAt: new Date(this.startedAtMs).toISOString(),
      workspacePath: '',
      skillIds,
    }

    const startCh = window.ipcRendererChannel?.StartStressTestRun
    if (!startCh?.invoke) {
      this.running = false
      throw new Error('StartStressTestRun IPC unavailable')
    }
    const started = await startCh.invoke({ runId, config })
    if (!started.ok) {
      this.running = false
      throw new Error(started.error || 'Failed to start stress run')
    }
    this.reportDir = started.reportDir
    this.lastReportDir = started.reportDir
    persistLastReportDir(started.reportDir)
    config.workspacePath = started.workspacePath

    this.metrics.start(started.reportDir)
    this.metrics.onSample((sample) => {
      this.fpsAvgs.push(sample.fps.avg)
      this.fpsMins.push(sample.fps.min)
      this.fpsLows.push(sample.fps.onePercentLow)
      const rss = sample.process.nodeMemory.rss
      if (rss > this.peakRss) this.peakRss = rss
      this.emitStatus()
    })
    this.statusTimer = setInterval(() => this.emitStatus(), 1000)

    const agentStore = useAgentStore()
    const cursors: SkillCursor[] = []
    let stoppedBy: StressRunSummary['stoppedBy'] = 'duration'
    const isAborted = () => this.abort

    // Open chat once for the soak. Do not re-force later — that blocks Settings → Stop.
    ensureStressChatView()

    try {
      for (const scenario of scenarios) {
        if (this.abort) break
        // Set agent without rebinding the currently focused conversation.
        agentStore.selectedAgentId = scenario.agentId
        await nextTick()
        const conv = await agentStore.createNewConversation(
          `Stress · ${scenario.label} · ${runId}`,
          {
            workspacePath: scenario.needsWorkspace
              ? started.workspacePath
              : undefined,
          },
        )
        if (!conv) {
          throw new Error(`Failed to create conversation for ${scenario.skillId}`)
        }
        this.conversationIds.push(conv.id)
        await agentStore.selectConversation(conv.id)
        const modeCh = window.ipcRendererChannel?.SetCodingMode
        if (modeCh?.invoke) {
          await modeCh.invoke({ conversationId: conv.id, mode: 'yolo' })
        }
        await nextTick()
        await waitForStressChatReady(20_000, { isAborted, openView: true })
        if (this.abort) break
        cursors.push({
          scenario,
          conversationId: conv.id,
          promptIndex: 0,
          scriptedExhausted: opts.inputMode === 'ai-continue',
          turnCount: 0,
        })
      }

      if (concurrencyMode === 'concurrent') {
        await Promise.all(
          cursors.map((cursor) =>
            this.runCursorUntilDone(cursor, {
              inputMode: opts.inputMode,
              durationMs: opts.durationMs,
              googleAuth: opts.googleWorkspaceAuthenticated !== false,
              focusConversation: false,
              isAborted,
            }),
          ),
        )
      } else {
        await this.runSequentialRoundRobin(cursors, {
          inputMode: opts.inputMode,
          durationMs: opts.durationMs,
          googleAuth: opts.googleWorkspaceAuthenticated !== false,
          isAborted,
        })
      }

      if (this.abort) stoppedBy = 'user'
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (this.abort || message === 'Stress test stopped') {
        stoppedBy = 'user'
      } else {
        stoppedBy = 'error'
        this.errorCount++
        this.status.lastError = message
        log.error('Stress run failed', { err })
      }
    } finally {
      if (this.statusTimer) clearInterval(this.statusTimer)
      this.statusTimer = null
      this.metrics.stop()
      this.activeConversationIds.clear()
    }

    const endedAt = new Date().toISOString()
    const durationMs = Date.now() - this.startedAtMs
    const sortedLat = [...this.latencies].sort((a, b) => a - b)
    const summary: StressRunSummary = {
      runId,
      startedAt: new Date(this.startedAtMs).toISOString(),
      endedAt,
      durationMs,
      plannedDurationMs: opts.durationMs,
      stoppedBy,
      turns: this.turnIndex,
      errors: this.errorCount,
      skillCounts: this.skillCounts,
      latencyMs: {
        p50: percentile(sortedLat, 50),
        p95: percentile(sortedLat, 95),
        max: sortedLat.length ? sortedLat[sortedLat.length - 1]! : 0,
        avg: sortedLat.length
          ? Math.round(sortedLat.reduce((a, b) => a + b, 0) / sortedLat.length)
          : 0,
      },
      fps: {
        avg: avgOf(this.fpsAvgs),
        min: this.fpsMins.length ? Math.min(...this.fpsMins) : 0,
        onePercentLow: avgOf(this.fpsLows),
      },
      peakRss: this.peakRss,
      reportDir: this.reportDir ?? '',
    }

    const finish = window.ipcRendererChannel?.FinishStressTestRun
    if (finish?.invoke && this.reportDir) {
      await finish.invoke({ reportDir: this.reportDir, summary })
    }

    this.lastSummary = summary
    if (summary.reportDir) {
      this.lastReportDir = summary.reportDir
      persistLastReportDir(summary.reportDir)
    }
    persistLastSummary(summary)
    this.running = false
    this.emitStatus()
    this.onStatus = null
    return summary
  }

  private async runSequentialRoundRobin(
    cursors: SkillCursor[],
    opts: {
      inputMode: StressInputMode
      durationMs: number
      googleAuth: boolean
      isAborted: () => boolean
    },
  ): Promise<void> {
    const agentStore = useAgentStore()
    let rr = 0
    while (!this.abort && Date.now() - this.startedAtMs < opts.durationMs) {
      if (cursors.length === 0) break
      const cursor = cursors[rr % cursors.length]!
      rr++

      if (opts.durationMs - (Date.now() - this.startedAtMs) <= 0) break

      await agentStore.selectConversation(cursor.conversationId)
      await nextTick()
      await waitForStressChatReady(0, { isAborted: opts.isAborted })
      if (this.abort) break

      const outcome = await this.runOneTurn(cursor, {
        inputMode: opts.inputMode,
        googleAuth: opts.googleAuth,
        isAborted: opts.isAborted,
      })
      if (outcome === 'stop') break
      if (outcome === 'skip-skill' && cursors.length === 1) break
    }
  }

  /** One skill's independent soak loop (used for concurrent mode). */
  private async runCursorUntilDone(
    cursor: SkillCursor,
    opts: {
      inputMode: StressInputMode
      durationMs: number
      googleAuth: boolean
      focusConversation: boolean
      isAborted: () => boolean
    },
  ): Promise<void> {
    const agentStore = useAgentStore()
    while (!this.abort && Date.now() - this.startedAtMs < opts.durationMs) {
      if (opts.focusConversation) {
        await agentStore.selectConversation(cursor.conversationId)
        await nextTick()
        await waitForStressChatReady(0, { isAborted: opts.isAborted })
        if (this.abort) break
      } else {
        // Ensure driver exists at least once; cached Chat instances survive Settings.
        const driver = getStressChatDriver()
        if (!driver?.isReady()) {
          await waitForStressChatReady(0, { isAborted: opts.isAborted })
          if (this.abort) break
        }
      }

      const outcome = await this.runOneTurn(cursor, {
        inputMode: opts.inputMode,
        googleAuth: opts.googleAuth,
        isAborted: opts.isAborted,
      })
      if (outcome === 'stop' || outcome === 'skip-skill') break
    }
  }

  private async runOneTurn(
    cursor: SkillCursor,
    opts: {
      inputMode: StressInputMode
      googleAuth: boolean
      isAborted: () => boolean
    },
  ): Promise<'ok' | 'stop' | 'skip-skill'> {
    const next = await this.resolveNextPrompt(
      cursor,
      opts.inputMode,
      opts.googleAuth,
    )
    if (!next) return 'skip-skill'

    this.turnIndex++
    const turnIndex = this.turnIndex
    this.currentSkillId = cursor.scenario.skillId
    this.activeConversationIds.add(cursor.conversationId)
    this.metrics.setTurnContext({
      skillId: cursor.scenario.skillId,
      turnIndex,
    })
    this.emitStatus()

    const t0 = Date.now()
    const driver = getStressChatDriver()
    if (!driver) {
      this.activeConversationIds.delete(cursor.conversationId)
      throw new Error('Stress chat driver missing')
    }
    const result = await driver.sendAndWait(next.text, {
      isAborted: opts.isAborted,
      conversationId: cursor.conversationId,
    })
    this.activeConversationIds.delete(cursor.conversationId)
    const latencyMs = Date.now() - t0
    this.latencies.push(latencyMs)
    this.metrics.setTurnContext({
      skillId: cursor.scenario.skillId,
      turnIndex,
      lastTurnLatencyMs: latencyMs,
    })

    const aborted = Boolean(result.aborted) || this.abort
    const ok = result.ok && !aborted
    if (!ok && !aborted) this.errorCount++
    this.skillCounts[cursor.scenario.skillId] =
      (this.skillCounts[cursor.scenario.skillId] ?? 0) + 1
    cursor.turnCount++

    const turn: StressTurnRecord = {
      t: new Date().toISOString(),
      skillId: cursor.scenario.skillId,
      conversationId: cursor.conversationId,
      turnIndex,
      promptId: next.promptId,
      promptSource: next.source,
      textPreview: next.text.slice(0, 240),
      latencyMs,
      ok,
      error: aborted ? 'Stopped' : result.error,
      hitlPaused: result.hitlPaused,
    }
    const appendTurn = window.ipcRendererChannel?.AppendStressTurnRecord
    if (appendTurn?.invoke && this.reportDir) {
      void appendTurn.invoke({ reportDir: this.reportDir, turn })
    }

    if (aborted) return 'stop'

    if (next.source === 'ai-generator' && result.assistantText) {
      const generated = stripGeneratedPrompt(result.assistantText)
      if (generated) {
        this.turnIndex++
        const turnIndex2 = this.turnIndex
        this.activeConversationIds.add(cursor.conversationId)
        const t1 = Date.now()
        const real = await driver.sendAndWait(generated, {
          isAborted: opts.isAborted,
          conversationId: cursor.conversationId,
        })
        this.activeConversationIds.delete(cursor.conversationId)
        const lat2 = Date.now() - t1
        this.latencies.push(lat2)
        const realAborted = Boolean(real.aborted) || this.abort
        if (!real.ok && !realAborted) this.errorCount++
        this.skillCounts[cursor.scenario.skillId] =
          (this.skillCounts[cursor.scenario.skillId] ?? 0) + 1
        cursor.turnCount++
        const turn2: StressTurnRecord = {
          t: new Date().toISOString(),
          skillId: cursor.scenario.skillId,
          conversationId: cursor.conversationId,
          turnIndex: turnIndex2,
          promptId: `${next.promptId}-applied`,
          promptSource: 'ai-continue',
          textPreview: generated.slice(0, 240),
          latencyMs: lat2,
          ok: real.ok && !realAborted,
          error: realAborted ? 'Stopped' : real.error,
          hitlPaused: real.hitlPaused,
        }
        if (appendTurn?.invoke && this.reportDir) {
          void appendTurn.invoke({ reportDir: this.reportDir, turn: turn2 })
        }
        if (realAborted) return 'stop'
      }
    }

    log.info('Stress turn complete', {
      skillId: cursor.scenario.skillId,
      turnIndex,
      latencyMs,
      ok,
    })
    return 'ok'
  }

  private async resolveNextPrompt(
    cursor: SkillCursor,
    mode: StressInputMode,
    googleAuth: boolean,
  ): Promise<{
    text: string
    promptId: string
    source: StressTurnRecord['promptSource']
  } | null> {
    const prompts = cursor.scenario.prompts.filter((p) => {
      if (cursor.scenario.skillId !== 'google-workspace') return true
      if (p.requiresAuth && !googleAuth) return false
      if (p.writeAction && !googleAuth) return false
      return true
    })
    if (prompts.length === 0) return null

    const useAi =
      mode === 'ai-continue' ||
      (mode === 'hybrid' && cursor.scriptedExhausted)

    if (useAi) {
      return {
        text: buildAiContinueGeneratorPrompt(cursor.scenario.skillId),
        promptId: `ai-gen-${cursor.turnCount + 1}`,
        source: 'ai-generator',
      }
    }

    if (cursor.promptIndex >= prompts.length) {
      if (mode === 'cycle') {
        cursor.promptIndex = 0
      } else if (mode === 'hybrid') {
        cursor.scriptedExhausted = true
        return {
          text: buildAiContinueGeneratorPrompt(cursor.scenario.skillId),
          promptId: `ai-gen-${cursor.turnCount + 1}`,
          source: 'ai-generator',
        }
      } else {
        return null
      }
    }

    const prompt = prompts[cursor.promptIndex]!
    cursor.promptIndex++
    if (cursor.promptIndex >= prompts.length && mode === 'hybrid') {
      cursor.scriptedExhausted = true
    }
    return {
      text: prompt.text,
      promptId: prompt.id,
      source: 'scripted',
    }
  }

  private emitStatus(): void {
    const elapsed = this.running ? Date.now() - this.startedAtMs : 0
    const remaining = Math.max(0, this.plannedDurationMs - elapsed)
    this.status = {
      running: this.running,
      runId: this.runId,
      elapsedMs: elapsed,
      remainingMs: remaining,
      currentSkillId: this.currentSkillId,
      turnIndex: this.turnIndex,
      lastLatencyMs: this.latencies.at(-1) ?? null,
      fps: this.metrics.getLatestFps(),
      rss: this.metrics.getLatestRss(),
      reportDir: this.reportDir,
      lastError: this.status.lastError,
    }
    this.onStatus?.(this.getLiveStatus())
  }
}

function idleStatus(): StressLiveStatus {
  return {
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
  }
}

function avgOf(values: number[]): number {
  if (!values.length) return 0
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

const LAST_REPORT_DIR_KEY = 'teralexi.stress.lastReportDir'
const LAST_SUMMARY_KEY = 'teralexi.stress.lastSummary'

function persistLastReportDir(dir: string | null | undefined): void {
  const trimmed = dir?.trim()
  if (!trimmed || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(LAST_REPORT_DIR_KEY, trimmed)
  } catch {
    /* ignore quota / private mode */
  }
}

function readPersistedLastReportDir(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    return sessionStorage.getItem(LAST_REPORT_DIR_KEY)
  } catch {
    return null
  }
}

function persistLastSummary(summary: StressRunSummary | null): void {
  if (!summary || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(LAST_SUMMARY_KEY, JSON.stringify(summary))
  } catch {
    /* ignore */
  }
}

function readPersistedLastSummary(): StressRunSummary | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(LAST_SUMMARY_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StressRunSummary
  } catch {
    return null
  }
}

/** Singleton used by Developer settings UI. */
let sharedRunner: StressTestRunner | null = null

export function getStressTestRunner(): StressTestRunner {
  if (!sharedRunner) {
    sharedRunner = new StressTestRunner()
    // Survive Settings remount / HMR losing the in-memory singleton mid-run.
    const persistedDir = readPersistedLastReportDir()
    const persistedSummary = readPersistedLastSummary()
    if (persistedDir) sharedRunner.hydrateLastReport(persistedDir, persistedSummary)
  }
  return sharedRunner
}
