/**
 * @deprecated Import from `@shared/agent/memory-settings` instead.
 * Re-exports preserved for existing imports.
 */
export {
  DEFAULT_MEMORY_RECORDING_SETTINGS,
  LEGACY_MEMORY_VECTOR_WRITE_KEY,
  MEMORY_RECORDING_PROP_KEYS,
  MEMORY_RECORDING_LAYER_UI,
  memoryRecordingFlagToString,
  parseMemoryRecordingFlag,
  parseMemoryRecordingSettings,
  type MemoryRecordingLayer,
  type MemoryRecordingSettings,
} from './memory-settings'

/** @deprecated Use {@link MEMORY_RECORDING_PROP_KEYS.vector}. */
export const MEMORY_RECORDING_PROP_KEYS_LEGACY = {
  vectorWrite: 'memory.vector.writeEnabled',
} as const
