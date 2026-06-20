/** Pure JSON parsing helpers used by repositories to decode SQLite-stored JSON columns. */

export function parseJsonObject(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') result[key] = value
    }
    return result
  } catch {
    return {}
  }
}

export function parseJsonStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

export function parseJsonStringArrayOrNull(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw)
    if (parsed === null) return null
    if (!Array.isArray(parsed)) return null
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return null
  }
}

export function parseJsonToolApprovalOverrides(
  raw: string | undefined | null,
): Record<string, boolean> {
  try {
    const parsed = JSON.parse(raw ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/** Stable JSON for SQLite (sorted keys). */
export function normalizeToolApprovalOverrides(
  overrides: Record<string, boolean> | undefined,
): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  if (!overrides) return out
  const keys = Object.keys(overrides).sort((a, b) => a.localeCompare(b))
  for (const k of keys) {
    const v = overrides[k]
    if (typeof v === 'boolean') out[k] = v
  }
  return out
}
