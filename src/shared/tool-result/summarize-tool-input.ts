/** Compact `key=value` summary of tool call args for display headers. */
export function summarizeToolInput(input: unknown, maxChars = 200): string {
  if (input === null || input === undefined) return ''
  if (typeof input === 'string') return input.trim().slice(0, maxChars)
  if (typeof input !== 'object' || Array.isArray(input)) {
    return String(input).slice(0, maxChars)
  }

  const record = input as Record<string, unknown>
  const priority = [
    'path',
    'pattern',
    'query',
    'url',
    'command',
    'name',
    'scriptType',
    'content',
    'offset',
    'limit',
    'recursive',
    'maxDepth',
    'include_package_files',
  ]
  const parts: string[] = []
  for (const key of priority) {
    const value = record[key]
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) parts.push(`${key}=${trimmed.slice(0, 80)}`)
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key}=${String(value)}`)
    }
    if (parts.join(', ').length >= maxChars) break
  }
  if (parts.length > 0) return parts.join(', ').slice(0, maxChars)

  try {
    return JSON.stringify(input).slice(0, maxChars)
  } catch {
    return ''
  }
}
