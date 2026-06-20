import {
  DEFAULT_MEMORY_RETENTION,
  MEMORY_RETENTION_PROP_KEYS,
  clampRetentionCount,
  parseMemoryRetentionSettings,
  type MemoryRetentionSettings,
} from './memory-retention'

export {
  DEFAULT_MEMORY_RETENTION,
  MEMORY_RETENTION_PROP_KEYS,
  parseMemoryRetentionSettings,
  type MemoryRetentionSettings,
} from './memory-retention'

/** System config keys for what to record after each successful turn. */
export const MEMORY_RECORDING_PROP_KEYS = {
  block: 'memory.recording.block',
  vector: 'memory.recording.vector',
  session: 'memory.recording.session',
  persona: 'memory.recording.persona',
} as const

/** @deprecated Read for migration only; use {@link MEMORY_RECORDING_PROP_KEYS.vector}. */
export const LEGACY_MEMORY_VECTOR_WRITE_KEY = 'memory.vector.writeEnabled'

export type MemoryRecordingLayer = keyof typeof MEMORY_RECORDING_PROP_KEYS

export type MemoryRecordingSettings = Record<MemoryRecordingLayer, boolean>

export const DEFAULT_MEMORY_RECORDING_SETTINGS: MemoryRecordingSettings = {
  block: true,
  session: true,
  persona: true,
  /** Opt-in until vector retrieval is wired; requires block recording. */
  vector: false,
}

export type MemoryRecordingLayerUi = {
  id: MemoryRecordingLayer
  title: string
  description: string
  path: string
  /** Shown indented under Block in Settings. */
  nestedUnderBlock?: boolean
  requiresBlock?: boolean
}

/** Settings → Memory recording toggles (order matches the on-disk pipeline). */
export const MEMORY_RECORDING_LAYER_UI: MemoryRecordingLayerUi[] = [
  {
    id: 'block',
    title: 'Block',
    description:
      'Raw user and assistant messages for each turn (foundation for all other layers).',
    path: '<agent-id>/block/*.json',
  },
  {
    id: 'vector',
    title: 'Vector index',
    description:
      'Copy each block into memory-vectors.db for future semantic recall (embeddings not wired yet).',
    path: 'memory/memory-vectors.db',
    nestedUnderBlock: true,
    requiresBlock: true,
  },
  {
    id: 'session',
    title: 'Session',
    description:
      'LLM-compacted summary, facts, and open threads per conversation.',
    path: '<agent-id>/session/<conversation>.json',
  },
  {
    id: 'persona',
    title: 'Persona',
    description:
      'LLM-built global user profile from recent sessions across agents.',
    path: 'users/<userId>/persona/profile.json',
  },
]

export type MemoryRetentionFieldUi = {
  id: keyof MemoryRetentionSettings
  title: string
  description: string
}

export const MEMORY_RETENTION_FIELD_UI: MemoryRetentionFieldUi[] = [
  {
    id: 'blocksPerAgent',
    title: 'Blocks per agent',
    description: 'Max raw turn files kept under each agent (oldest pruned).',
  },
  {
    id: 'sessionsPerAgent',
    title: 'Sessions per agent',
    description: 'Max conversation session snapshots kept per agent.',
  },
  {
    id: 'sessionsForAgentPersona',
    title: 'Sessions for persona',
    description:
      'Recent session snapshots fed into persona abstraction per agent.',
  },
]

export const MEMORY_SETTINGS_PROP_KEYS = [
  ...Object.values(MEMORY_RECORDING_PROP_KEYS),
  LEGACY_MEMORY_VECTOR_WRITE_KEY,
  ...Object.values(MEMORY_RETENTION_PROP_KEYS),
] as const

export type MemorySettings = {
  recording: MemoryRecordingSettings
  retention: MemoryRetentionSettings
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  recording: DEFAULT_MEMORY_RECORDING_SETTINGS,
  retention: DEFAULT_MEMORY_RETENTION,
}

/** `true` when unset or empty (default enabled for block/session/persona). */
export function parseMemoryRecordingFlag(value: string | undefined): boolean {
  if (value === undefined || value === '') return true
  const normalized = value.trim().toLowerCase()
  return normalized !== 'false' && normalized !== '0' && normalized !== 'no'
}

/** `false` when unset or empty (vector is opt-in). */
function parseMemoryVectorRecordingFlag(
  values: Record<string, string | undefined>,
): boolean {
  const current = values[MEMORY_RECORDING_PROP_KEYS.vector]
  if (current !== undefined && current !== '') {
    return parseMemoryRecordingFlag(current)
  }
  const legacy = values[LEGACY_MEMORY_VECTOR_WRITE_KEY]
  if (legacy !== undefined && legacy !== '') {
    return parseMemoryRecordingFlag(legacy)
  }
  return DEFAULT_MEMORY_RECORDING_SETTINGS.vector
}

export function memoryRecordingFlagToString(enabled: boolean): string {
  return enabled ? 'true' : 'false'
}

export function parseMemoryRecordingSettings(
  values: Record<string, string | undefined>,
): MemoryRecordingSettings {
  return {
    block: parseMemoryRecordingFlag(values[MEMORY_RECORDING_PROP_KEYS.block]),
    session: parseMemoryRecordingFlag(
      values[MEMORY_RECORDING_PROP_KEYS.session],
    ),
    persona: parseMemoryRecordingFlag(
      values[MEMORY_RECORDING_PROP_KEYS.persona],
    ),
    vector: parseMemoryVectorRecordingFlag(values),
  }
}

export function parseMemorySettings(
  values: Record<string, string | undefined>,
): MemorySettings {
  return {
    recording: parseMemoryRecordingSettings(values),
    retention: parseMemoryRetentionSettings(values),
  }
}

export function retentionCountToString(value: number): string {
  return String(clampRetentionCount(value, 1))
}
