import { appendFileSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { freemem, totalmem } from 'os'
import {
  getTeralexiStressRunsDir,
  getTeralexiStressWorkspaceDir,
} from '@config/teralexi-home'
import type {
  StressMetricsSample,
  StressProcessMetrics,
  StressRunConfig,
  StressRunSummary,
  StressTurnRecord,
} from '@shared/stress-test/types'
import { createLogger } from '@main/logger'

const log = createLogger('stress-test')

function sanitizeRunId(runId: string): string {
  return (
    runId
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'run'
  )
}

export function createStressRunDirectory(runId: string): string {
  const dir = join(getTeralexiStressRunsDir(), sanitizeRunId(runId))
  mkdirSync(dir, { recursive: true })
  return dir
}

export function ensureStressWorkspaceReady(): string {
  const dir = getTeralexiStressWorkspaceDir()
  mkdirSync(dir, { recursive: true })
  // Seed a minimal package so coding tools have something to explore.
  const readme = join(dir, 'README.md')
  try {
    writeFileSync(
      readme,
      '# Teralexi stress-test workspace\n\nScratch project for soak runs. Safe to mutate.\n',
      { flag: 'wx' },
    )
  } catch {
    /* already exists */
  }
  return dir
}

export function writeStressRunConfig(
  reportDir: string,
  config: StressRunConfig,
): void {
  writeFileSync(join(reportDir, 'config.json'), JSON.stringify(config, null, 2))
  log.info('Stress run config written', { reportDir, runId: config.runId })
}

export function appendStressMetricsSample(
  reportDir: string,
  sample: StressMetricsSample,
): void {
  appendFileSync(join(reportDir, 'metrics.jsonl'), `${JSON.stringify(sample)}\n`)
}

export function appendStressTurnRecord(
  reportDir: string,
  turn: StressTurnRecord,
): void {
  appendFileSync(join(reportDir, 'turns.jsonl'), `${JSON.stringify(turn)}\n`)
}

export function writeStressRunSummary(
  reportDir: string,
  summary: StressRunSummary,
): void {
  writeFileSync(join(reportDir, 'summary.json'), JSON.stringify(summary, null, 2))
  log.info('Stress run summary written', {
    reportDir,
    turns: summary.turns,
    errors: summary.errors,
    stoppedBy: summary.stoppedBy,
  })
}

function metricType(
  m: Electron.ProcessMetric,
): 'Browser' | 'Tab' | 'GPU' | 'Utility' | 'Unknown' {
  const t = String(m.type ?? '')
  if (t === 'Browser') return 'Browser'
  if (t === 'Tab' || t === 'Renderer') return 'Tab'
  if (t === 'GPU') return 'GPU'
  if (t.toLowerCase().includes('utility')) return 'Utility'
  return 'Unknown'
}

export function sampleAppProcessMetrics(): StressProcessMetrics {
  const metrics = app.getAppMetrics()
  const main =
    metrics.find((m) => metricType(m) === 'Browser') ?? metrics[0]
  const renderer = metrics.find((m) => metricType(m) === 'Tab')
  const gpu = metrics.find((m) => metricType(m) === 'GPU')
  const mem = process.memoryUsage()

  const mapOne = (m: Electron.ProcessMetric | undefined) =>
    m
      ? {
          cpuPercent: m.cpu.percentCPUUsage,
          workingSetSize: m.memory.workingSetSize * 1024,
          peakWorkingSetSize:
            typeof m.memory.peakWorkingSetSize === 'number'
              ? m.memory.peakWorkingSetSize * 1024
              : undefined,
          pid: m.pid,
        }
      : undefined

  const mainMapped = mapOne(main) ?? {
    cpuPercent: 0,
    workingSetSize: mem.rss,
    pid: process.pid,
  }

  return {
    sampledAt: new Date().toISOString(),
    main: mainMapped,
    renderer: mapOne(renderer),
    gpu: mapOne(gpu),
    nodeMemory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
    },
    system: {
      freemem: freemem(),
      totalmem: totalmem(),
    },
  }
}
