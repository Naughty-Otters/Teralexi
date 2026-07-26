import type { Logger as PinoLogger } from 'pino'
import type { LogContext } from './pino-framework'

export type AgentRunLogMeta = {
  agentId: string
  conversationId: string
  assistantMessageId: string
}

/**
 * Per-run agent log files + duplicateEmit were disabled: pino-pretty rewrite of
 * every instrumented debug/info line dominated CPU during streaming (~900ms
 * inclusive in chat perf traces) without helping the live UI path.
 */
export function getAgentRunLogFilePath(): string | undefined {
  return undefined
}

export function duplicateAgentRunLog(
  _logger: PinoLogger,
  _level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
  _message: string,
  _context?: LogContext,
): void {
  // Intentionally no-op — see module note above.
}

export async function runWithAgentRunLog<T>(
  _meta: AgentRunLogMeta,
  fn: () => Promise<T>,
): Promise<T> {
  return fn()
}
