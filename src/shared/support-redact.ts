const SECRET_KEY_PATTERN =
  /(?:api[_-]?key|token|secret|password|credential|authorization|client[_-]?secret|private[_-]?key|bearer|cookie)/i

export function shouldRedactPropertyKey(key: string): boolean {
  const normalized = key.trim().toLowerCase()
  if (!normalized) return false
  if (SECRET_KEY_PATTERN.test(normalized)) return true
  if (normalized.includes('settings.') && SECRET_KEY_PATTERN.test(normalized)) {
    return true
  }
  return (
    normalized.endsWith('.token') ||
    normalized.endsWith('.secret') ||
    normalized.endsWith('.apikey')
  )
}

export function redactStringValue(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return value
  if (/^sk-[a-z0-9_-]{8,}$/i.test(trimmed)) return '[REDACTED]'
  if (/^ghp_[a-z0-9]{20,}$/i.test(trimmed)) return '[REDACTED]'
  if (/^xox[baprs]-[a-z0-9-]{10,}$/i.test(trimmed)) return '[REDACTED]'
  return value
}

export function redactRecord(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (shouldRedactPropertyKey(key)) {
      out[key] = '[REDACTED]'
      continue
    }
    out[key] = redactStringValue(value)
  }
  return out
}

export function redactPropertiesFile(content: string): string {
  const lines = content.split(/\r?\n/)
  return lines
    .map((rawLine) => {
      const line = rawLine.trimEnd()
      if (!line || line.startsWith('#')) return rawLine
      const eqIndex = line.indexOf('=')
      if (eqIndex <= 0) return rawLine
      const key = line.slice(0, eqIndex).trim()
      const value = line.slice(eqIndex + 1)
      if (shouldRedactPropertyKey(key)) {
        return `${key}=[REDACTED]`
      }
      return `${key}=${redactStringValue(value)}`
    })
    .join('\n')
}
