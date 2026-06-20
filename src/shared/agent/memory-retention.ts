/** System config keys for memory retention (`config.properties`). */
export const MEMORY_RETENTION_PROP_KEYS = {
  blocksPerAgent: 'memory.retention.blocksPerAgent',
  sessionsPerAgent: 'memory.retention.sessionsPerAgent',
  /** Last N session snapshots used to rebuild per-agent persona. */
  sessionsForAgentPersona: 'memory.retention.sessionsForAgentPersona',
  /** @deprecated Use {@link MEMORY_RETENTION_PROP_KEYS.sessionsForAgentPersona}. */
  conversationsForAgentPersona: 'memory.retention.conversationsForAgentPersona',
} as const

export type MemoryRetentionSettings = {
  /** Max raw `block/` files kept per agent (oldest deleted). */
  blocksPerAgent: number
  /** Max `session/` snapshot files kept per agent (oldest deleted). */
  sessionsPerAgent: number
  /** Recent session snapshots fed into per-agent persona abstraction. */
  sessionsForAgentPersona: number
}

export const DEFAULT_MEMORY_RETENTION: MemoryRetentionSettings = {
  blocksPerAgent: 5,
  sessionsPerAgent: 5,
  sessionsForAgentPersona: 5,
}

const MIN_RETENTION = 1
const MAX_RETENTION = 500

export function clampRetentionCount(
  value: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(MIN_RETENTION, Math.min(MAX_RETENTION, Math.floor(value)))
}

export function parseRetentionCount(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number.parseInt(value.trim(), 10)
  return clampRetentionCount(parsed, fallback)
}

export function parseMemoryRetentionSettings(
  values: Record<string, string | undefined>,
): MemoryRetentionSettings {
  return {
    blocksPerAgent: parseRetentionCount(
      values[MEMORY_RETENTION_PROP_KEYS.blocksPerAgent],
      DEFAULT_MEMORY_RETENTION.blocksPerAgent,
    ),
    sessionsPerAgent: parseRetentionCount(
      values[MEMORY_RETENTION_PROP_KEYS.sessionsPerAgent],
      DEFAULT_MEMORY_RETENTION.sessionsPerAgent,
    ),
    sessionsForAgentPersona: parseRetentionCount(
      values[MEMORY_RETENTION_PROP_KEYS.sessionsForAgentPersona] ??
        values[MEMORY_RETENTION_PROP_KEYS.conversationsForAgentPersona],
      DEFAULT_MEMORY_RETENTION.sessionsForAgentPersona,
    ),
  }
}
