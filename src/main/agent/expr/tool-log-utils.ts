const MAX_DEFAULT_CHARS = 8_000

/** Stable JSON for logs; truncates oversized payloads. */
export function serializeForToolLog(
  value: unknown,
  maxChars = MAX_DEFAULT_CHARS,
): unknown {
  if (value === undefined) return undefined
  try {
    const text = JSON.stringify(value)
    if (text.length <= maxChars) {
      try {
        return JSON.parse(text) as unknown
      } catch {
        return text
      }
    }
    return {
      _truncated: true,
      preview: text.slice(0, maxChars),
      totalChars: text.length,
    }
  } catch {
    const text = String(value)
    if (text.length <= maxChars) return text
    return {
      _truncated: true,
      preview: text.slice(0, maxChars),
      totalChars: text.length,
    }
  }
}
