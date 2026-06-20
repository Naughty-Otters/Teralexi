/** True when an error represents user/agent cancellation (AbortController, DOM abort). */
export function isAbortError(err: unknown): boolean {
  if (!err) return false
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true
    if ('code' in err && (err as { code?: unknown }).code === 20) return true
    return /abort|cancel/i.test(err.message)
  }
  return false
}
