const CONTEXT_OVERFLOW_PATTERNS = [
  'context length',
  'context_length_exceeded',
  'context window',
  'maximum context',
  'token limit',
  'too many tokens',
  'prompt is too long',
  'input too long',
  'exceeds maximum',
  'maximum tokens',
  'tokens exceeded',
  'content too large',
]

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Lightweight overflow check for step retries (no providers import). */
export function isContextOverflowError(error: unknown): boolean {
  const msg = errorMessage(error).toLowerCase()
  return CONTEXT_OVERFLOW_PATTERNS.some((pattern) => msg.includes(pattern))
}
