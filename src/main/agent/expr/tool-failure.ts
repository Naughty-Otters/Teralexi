/**
 * Classify whether a tool result represents a failure (soft failure, not thrown).
 */
export function classifyToolFailure(toolName: string, result: unknown): boolean {
  void toolName
  if (result === null || result === undefined) return false

  if (typeof result === 'object') {
    const r = result as Record<string, unknown>
    if (r['success'] === false) return true
    if (r['error'] != null && r['error'] !== false) return true
    if (typeof r['exit_code'] === 'number' && r['exit_code'] !== 0) return true
  }

  if (typeof result === 'string') {
    const trimmed = result.trimStart()
    if (/^error[:\s]/i.test(trimmed)) return true
    if (trimmed.startsWith('Exception')) return true
    try {
      const parsed = JSON.parse(result) as Record<string, unknown>
      if (parsed['success'] === false) return true
      if (parsed['error'] != null && parsed['error'] !== false) return true
      if (typeof parsed['exit_code'] === 'number' && parsed['exit_code'] !== 0) {
        return true
      }
    } catch {
      // not JSON
    }
  }

  return false
}
