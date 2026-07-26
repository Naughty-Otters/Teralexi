import {
  STRESS_SKILL_IDS,
  type StressConcurrencyMode,
  type StressInputMode,
  type StressSkillId,
} from '@shared/stress-test'
import { readStoredString, writeStoredString } from '@renderer/lib/layout-preferences'

const STORAGE_KEY = 'teralexi.stress.panelSettings'

export type StressPanelPersistedSettings = {
  selectedScenarios: StressSkillId[]
  durationPreset: string
  customDuration: string
  inputMode: StressInputMode
  concurrencyMode: StressConcurrencyMode
}

const INPUT_MODES: readonly StressInputMode[] = [
  'hybrid',
  'cycle',
  'ai-continue',
]

const CONCURRENCY_MODES: readonly StressConcurrencyMode[] = [
  'sequential',
  'concurrent',
]

const DURATION_PRESETS = new Set(['2m', '30m', '2h', '10h', 'custom'])

function isStressSkillId(value: unknown): value is StressSkillId {
  return (
    typeof value === 'string' &&
    (STRESS_SKILL_IDS as readonly string[]).includes(value)
  )
}

function normalizeSelectedScenarios(raw: unknown): StressSkillId[] {
  if (!Array.isArray(raw)) return [...STRESS_SKILL_IDS]
  const set = new Set<StressSkillId>()
  for (const item of raw) {
    if (isStressSkillId(item)) set.add(item)
  }
  return STRESS_SKILL_IDS.filter((id) => set.has(id))
}

function normalizeInputMode(raw: unknown): StressInputMode {
  if (typeof raw === 'string' && INPUT_MODES.includes(raw as StressInputMode)) {
    return raw as StressInputMode
  }
  return 'hybrid'
}

function normalizeConcurrencyMode(raw: unknown): StressConcurrencyMode {
  if (
    typeof raw === 'string' &&
    CONCURRENCY_MODES.includes(raw as StressConcurrencyMode)
  ) {
    return raw as StressConcurrencyMode
  }
  return 'sequential'
}

function normalizeDurationPreset(raw: unknown): string {
  if (typeof raw === 'string' && DURATION_PRESETS.has(raw)) return raw
  return '2m'
}

function normalizeCustomDuration(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return '15m'
}

export function loadStressPanelSettings(): StressPanelPersistedSettings | null {
  const raw = readStoredString(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    const obj = parsed as Record<string, unknown>
    return {
      selectedScenarios: normalizeSelectedScenarios(obj.selectedScenarios),
      durationPreset: normalizeDurationPreset(obj.durationPreset),
      customDuration: normalizeCustomDuration(obj.customDuration),
      inputMode: normalizeInputMode(obj.inputMode),
      concurrencyMode: normalizeConcurrencyMode(obj.concurrencyMode),
    }
  } catch {
    return null
  }
}

export function saveStressPanelSettings(
  settings: StressPanelPersistedSettings,
): void {
  writeStoredString(
    STORAGE_KEY,
    JSON.stringify({
      selectedScenarios: normalizeSelectedScenarios(settings.selectedScenarios),
      durationPreset: normalizeDurationPreset(settings.durationPreset),
      customDuration: normalizeCustomDuration(settings.customDuration),
      inputMode: normalizeInputMode(settings.inputMode),
      concurrencyMode: normalizeConcurrencyMode(settings.concurrencyMode),
    }),
  )
}
