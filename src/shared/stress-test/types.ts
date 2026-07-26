/** Bundled chat skill ids exercised by the stress harness. */
export type StressSkillId =
  | 'default'
  | 'coding'
  | 'coding-pr'
  | 'coding-review'
  | 'documents'
  | 'research'
  | 'website'
  | 'google-workspace'

export const STRESS_SKILL_IDS: readonly StressSkillId[] = [
  'default',
  'coding',
  'coding-pr',
  'coding-review',
  'documents',
  'research',
  'website',
  'google-workspace',
] as const

export type StressInputMode = 'cycle' | 'ai-continue' | 'hybrid'

/** How selected scenario conversations are scheduled. */
export type StressConcurrencyMode = 'sequential' | 'concurrent'

/** Selected skill ids to include in a soak (order preserved, round-robin). */
export type StressScenarioFilter = readonly StressSkillId[]

export type StressPrompt = {
  id: string
  text: string
  /** Soft hints for tooling paths the prompt should hit. */
  expectTools?: string[]
  tags?: string[]
  /** Skip when Google Workspace is not signed in. */
  requiresAuth?: boolean
  /** Prefer skipping when it would send mail / mutate calendar / etc. */
  writeAction?: boolean
}

export type StressScenario = {
  skillId: StressSkillId
  agentId: string
  label: string
  /** Skills that need a project folder (coding / website). */
  needsWorkspace: boolean
  prompts: StressPrompt[]
}

export type StressRunConfig = {
  runId: string
  scenarioFilter: StressScenarioFilter
  inputMode: StressInputMode
  concurrencyMode: StressConcurrencyMode
  durationMs: number
  startedAt: string
  workspacePath: string
  skillIds: StressSkillId[]
}

export type StressProcessMetrics = {
  sampledAt: string
  main: {
    cpuPercent: number
    workingSetSize: number
    peakWorkingSetSize?: number
    pid: number
  }
  renderer?: {
    cpuPercent: number
    workingSetSize: number
    pid: number
  }
  gpu?: {
    cpuPercent: number
    workingSetSize: number
    pid: number
  }
  nodeMemory: {
    rss: number
    heapUsed: number
    heapTotal: number
    external: number
  }
  system: {
    freemem: number
    totalmem: number
  }
}

export type StressFpsSample = {
  avg: number
  min: number
  onePercentLow: number
  frames: number
}

export type StressMetricsSample = {
  t: string
  elapsedMs: number
  fps: StressFpsSample
  process: StressProcessMetrics
  chatUi: { ingressChunks: number; uiFlushes: number }
  currentSkillId?: StressSkillId
  turnIndex?: number
  lastTurnLatencyMs?: number
}

export type StressTurnRecord = {
  t: string
  skillId: StressSkillId
  conversationId: string
  turnIndex: number
  promptId: string
  promptSource: 'scripted' | 'ai-continue' | 'ai-generator'
  textPreview: string
  latencyMs: number
  ok: boolean
  error?: string
  hitlPaused?: boolean
}

export type StressRunSummary = {
  runId: string
  startedAt: string
  endedAt: string
  durationMs: number
  plannedDurationMs: number
  stoppedBy: 'duration' | 'user' | 'error'
  turns: number
  errors: number
  skillCounts: Partial<Record<StressSkillId, number>>
  latencyMs: { p50: number; p95: number; max: number; avg: number }
  fps: { avg: number; min: number; onePercentLow: number }
  peakRss: number
  reportDir: string
}

export type StressLiveStatus = {
  running: boolean
  runId: string | null
  elapsedMs: number
  remainingMs: number
  currentSkillId: StressSkillId | null
  turnIndex: number
  lastLatencyMs: number | null
  fps: StressFpsSample | null
  rss: number | null
  reportDir: string | null
  lastError: string | null
}

export function skillIdToAgentId(skillId: StressSkillId): string {
  return `skill:${skillId}`
}

export function formatDurationLabel(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${(ms / 3_600_000).toFixed(ms % 3_600_000 === 0 ? 0 : 1)}h`
}
