import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getTeralexiAgentLogsDir } from '@config/teralexi-home'
import type { Logger as PinoLogger } from 'pino'
import type { DestinationStream } from 'pino'
import pino from 'pino'
import type { LogContext } from './pino-framework'
import { createAgentRunLogDestination } from './pretty-stream'

export type AgentRunLogMeta = {
  agentId: string
  conversationId: string
  assistantMessageId: string
}

type AgentRunLogStore = {
  runLogger: PinoLogger
  logFilePath: string
  destination: DestinationStream
  end: () => void
}

const agentRunLogStorage = new AsyncLocalStorage<AgentRunLogStore>()

function sanitizeLogSegment(value: string, maxLen = 48): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!cleaned) return 'unknown'
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned
}

function buildAgentRunLogPath(meta: AgentRunLogMeta): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const agentPart = sanitizeLogSegment(meta.agentId)
  const convPart = sanitizeLogSegment(meta.conversationId, 24)
  const assistantPart = sanitizeLogSegment(meta.assistantMessageId, 16)
  const dir = join(getTeralexiAgentLogsDir(), agentPart)
  mkdirSync(dir, { recursive: true })
  return join(
    dir,
    `${stamp}_${convPart}_${assistantPart}.log`,
  )
}

function normalizeContext(context?: LogContext): Record<string, unknown> | undefined {
  if (context == null) return undefined
  if (context instanceof Error) return { err: context }
  if (typeof context === 'object') return context as Record<string, unknown>
  return { value: context }
}

function flushDestination(destination: DestinationStream): void {
  const dest = destination as DestinationStream & {
    flush?: (cb?: (err?: Error | null) => void) => void
    destroyed?: boolean
  }

  if (dest.destroyed) return

  if (typeof dest.flush !== 'function') return

  try {
    dest.flush()
  } catch {
    /* Async SonicBoom may not be ready; never fail the agent run for logging. */
  }
}

export function getAgentRunLogFilePath(): string | undefined {
  return agentRunLogStorage.getStore()?.logFilePath
}

export function duplicateAgentRunLog(
  logger: PinoLogger,
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
  message: string,
  context?: LogContext,
): void {
  const store = agentRunLogStorage.getStore()
  if (!store) return

  const payload = normalizeContext(context)
  const bindings =
    typeof logger.bindings === 'function' ? logger.bindings() : {}

  if (payload) {
    store.runLogger[level]({ ...bindings, ...payload }, message)
    return
  }
  if (Object.keys(bindings).length > 0) {
    store.runLogger[level](bindings, message)
    return
  }
  store.runLogger[level](message)
}

export async function runWithAgentRunLog<T>(
  meta: AgentRunLogMeta,
  fn: () => Promise<T>,
): Promise<T> {
  const logFilePath = buildAgentRunLogPath(meta)
  const destination = createAgentRunLogDestination(logFilePath)

  const runLogger = pino(
    {
      level: 'trace',
      base: {
        agentId: meta.agentId,
        conversationId: meta.conversationId,
        assistantMessageId: meta.assistantMessageId,
        logFile: logFilePath,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: {
        err: pino.stdSerializers.err,
      },
    },
    destination,
  )

  const store: AgentRunLogStore = {
    runLogger,
    logFilePath,
    destination,
    end: () => {
      runLogger.flush()
      flushDestination(destination)
    },
  }

  runLogger.info(
    `Agent run log started agentId=${meta.agentId} conversationId=${meta.conversationId} assistantMessageId=${meta.assistantMessageId}`,
  )

  try {
    return await agentRunLogStorage.run(store, fn)
  } finally {
    runLogger.info(
      `Agent run log finished agentId=${meta.agentId} conversationId=${meta.conversationId} assistantMessageId=${meta.assistantMessageId}`,
    )
    store.end()
  }
}
