import { getSystemPropValues } from '@config/system-prop'
import {
  MEMORY_RETENTION_PROP_KEYS,
  parseMemoryRetentionSettings,
  type MemoryRetentionSettings,
} from '@shared/agent/memory-retention'

export function loadMemoryRetentionSettings(): MemoryRetentionSettings {
  const values = getSystemPropValues(Object.values(MEMORY_RETENTION_PROP_KEYS))
  return parseMemoryRetentionSettings(values)
}
