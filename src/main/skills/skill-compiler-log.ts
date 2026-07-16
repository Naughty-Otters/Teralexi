import { ZodError } from 'zod'

type CompileLogger = {
  error: (message: string, context?: Record<string, unknown>) => void
}

export function formatCompileError(err: unknown): {
  message: string
  stack?: string
  zodIssues?: unknown
} {
  if (err instanceof ZodError) {
    return {
      message: err.message,
      zodIssues: err.issues,
      stack: err.stack,
    }
  }
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack }
  }
  return { message: String(err) }
}

export function logTextSnippet(text: string, max = 800): string {
  const t = text.trim()
  if (!t) return '(empty)'
  if (t.length <= max) return t
  return `${t.slice(0, max)}… [${t.length} chars total]`
}

export function shortFingerprint(fp: string): string {
  if (!fp) return '(none)'
  if (fp.length <= 16) return fp
  return `${fp.slice(0, 8)}…${fp.slice(-8)}`
}

export function logCompileError(
  log: CompileLogger,
  skillId: string,
  phase: string,
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  const formatted = formatCompileError(err)
  log.error(
    `skill compile failed: ${phase}`,
    {
      skillId,
      phase,
      ...formatted,
      ...extra,
    },
  )
}
