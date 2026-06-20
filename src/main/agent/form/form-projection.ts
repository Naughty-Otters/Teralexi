/** Default prior-step artifact for form title, message, and select options. */
export const FORM_PROJECTION_ARTIFACT_DEFAULT = 'form-projection.json'

export function normalizeJsonPath(path: string): string {
  return path.trim().replace(/^\$\.?/, '')
}

/** Reads a nested value using dot segments (e.g. `options.tag_filter`). */
export function getJsonPathValue(root: unknown, jsonPath: string): unknown {
  const normalized = normalizeJsonPath(jsonPath)
  if (!normalized) return undefined

  let current: unknown = root
  for (const segment of normalized.split('.')) {
    const key = segment.trim()
    if (!key) return undefined
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export function parseJsonObjectFromContent(content: string): Record<string, unknown> | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = [fenced?.[1]?.trim(), content.trim()].filter(Boolean) as string[]
  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      /* try next */
    }
  }
  return null
}

export function coerceProjectionString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return undefined
}
