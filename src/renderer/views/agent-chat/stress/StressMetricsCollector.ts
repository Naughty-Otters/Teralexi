import {
  getChatUiPerfCounters,
  resetChatUiPerfCounters,
  setChatUiPerfStressMode,
} from '../perf/chatUiPerf'
import type {
  StressFpsSample,
  StressMetricsSample,
  StressProcessMetrics,
  StressSkillId,
} from '@shared/stress-test/types'

type Listener = (sample: StressMetricsSample) => void

/**
 * Collects renderer FPS (rAF) and periodically samples main-process metrics.
 */
export class StressMetricsCollector {
  private rafId = 0
  private sampleTimer: ReturnType<typeof setInterval> | null = null
  private frameTimes: number[] = []
  private lastFrame = 0
  private startedAt = 0
  private listeners = new Set<Listener>()
  private latestFps: StressFpsSample = {
    avg: 0,
    min: 0,
    onePercentLow: 0,
    frames: 0,
  }
  private latestProcess: StressProcessMetrics | null = null
  private currentSkillId: StressSkillId | undefined
  private turnIndex: number | undefined
  private lastTurnLatencyMs: number | undefined
  private reportDir: string | null = null
  private stopped = true

  start(reportDir: string, intervalMs = 5000): void {
    this.stop()
    this.reportDir = reportDir
    this.stopped = false
    this.startedAt = Date.now()
    this.frameTimes = []
    this.lastFrame = performance.now()
    setChatUiPerfStressMode(true)
    resetChatUiPerfCounters()
    const tick = (now: number) => {
      if (this.stopped) return
      const dt = now - this.lastFrame
      this.lastFrame = now
      if (dt > 0 && dt < 1000) this.frameTimes.push(dt)
      // Keep ~2s of frames
      while (this.frameTimes.length > 120) this.frameTimes.shift()
      this.latestFps = computeFps(this.frameTimes)
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
    void this.sampleOnce()
    this.sampleTimer = setInterval(() => {
      void this.sampleOnce()
    }, intervalMs)
  }

  stop(): void {
    this.stopped = true
    setChatUiPerfStressMode(false)
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
    if (this.sampleTimer) clearInterval(this.sampleTimer)
    this.sampleTimer = null
  }

  setTurnContext(opts: {
    skillId?: StressSkillId
    turnIndex?: number
    lastTurnLatencyMs?: number
  }): void {
    this.currentSkillId = opts.skillId
    this.turnIndex = opts.turnIndex
    this.lastTurnLatencyMs = opts.lastTurnLatencyMs
  }

  onSample(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getLatestFps(): StressFpsSample {
    return this.latestFps
  }

  getLatestRss(): number | null {
    return this.latestProcess?.nodeMemory.rss ?? null
  }

  private async sampleOnce(): Promise<void> {
    if (this.stopped || !this.reportDir) return
    const ch = window.ipcRendererChannel?.GetAppProcessMetrics
    let processMetrics: StressProcessMetrics | null = null
    if (ch?.invoke) {
      try {
        processMetrics = await ch.invoke()
      } catch {
        processMetrics = null
      }
    }
    if (processMetrics) this.latestProcess = processMetrics
    const chatUi = getChatUiPerfCounters()
    const sample: StressMetricsSample = {
      t: new Date().toISOString(),
      elapsedMs: Date.now() - this.startedAt,
      fps: this.latestFps,
      process:
        processMetrics ??
        this.latestProcess ?? {
          sampledAt: new Date().toISOString(),
          main: { cpuPercent: 0, workingSetSize: 0, pid: 0 },
          nodeMemory: { rss: 0, heapUsed: 0, heapTotal: 0, external: 0 },
          system: { freemem: 0, totalmem: 0 },
        },
      chatUi,
      currentSkillId: this.currentSkillId,
      turnIndex: this.turnIndex,
      lastTurnLatencyMs: this.lastTurnLatencyMs,
    }
    for (const listener of this.listeners) listener(sample)
    const append = window.ipcRendererChannel?.AppendStressMetricsSample
    if (append?.invoke && this.reportDir) {
      void append.invoke({ reportDir: this.reportDir, sample })
    }
  }
}

function computeFps(frameTimes: number[]): StressFpsSample {
  if (frameTimes.length === 0) {
    return { avg: 0, min: 0, onePercentLow: 0, frames: 0 }
  }
  const fpsList = frameTimes.map((dt) => 1000 / dt)
  const avg = fpsList.reduce((a, b) => a + b, 0) / fpsList.length
  const min = Math.min(...fpsList)
  const sorted = [...fpsList].sort((a, b) => a - b)
  const idx = Math.max(0, Math.floor(sorted.length * 0.01))
  const onePercentLow = sorted[idx] ?? min
  return {
    avg: Math.round(avg * 10) / 10,
    min: Math.round(min * 10) / 10,
    onePercentLow: Math.round(onePercentLow * 10) / 10,
    frames: frameTimes.length,
  }
}
