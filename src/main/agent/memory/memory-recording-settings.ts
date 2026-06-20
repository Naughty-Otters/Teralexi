import { getSystemPropValues } from '@config/system-prop'
import {
  LEGACY_MEMORY_VECTOR_WRITE_KEY,
  MEMORY_RECORDING_PROP_KEYS,
  parseMemoryRecordingSettings,
  type MemoryRecordingSettings,
} from '@shared/agent/memory-settings'

export function loadMemoryRecordingSettings(): MemoryRecordingSettings {
  const values = getSystemPropValues([
    ...Object.values(MEMORY_RECORDING_PROP_KEYS),
    LEGACY_MEMORY_VECTOR_WRITE_KEY,
  ])
  return parseMemoryRecordingSettings(values)
}
