import type { DestinationStream } from 'pino'
import pinoPretty from 'pino-pretty'
import {
  createRotatingPinoFileDestination,
  type RotatingLogOptions,
} from './log-rotation'

export type { RotatingLogOptions } from './log-rotation'
export {
  DEFAULT_MAX_LOG_BYTES,
  DEFAULT_MAX_LOG_FILES,
  createRotatingPinoFileDestination,
} from './log-rotation'

/** True in local development — console and per-run agent logs use human-readable lines. */
export function usePrettyLogs(): boolean {
  return process.env.NODE_ENV === 'development'
}

/**
 * File-backed pino destination that is ready before the first write or process exit.
 * Rotates to numbered archives when the active file exceeds maxBytes.
 */
export function createPinoFileDestination(
  logFilePath: string,
  options?: RotatingLogOptions,
): DestinationStream {
  return createRotatingPinoFileDestination(logFilePath, options)
}

export function createPrettyLogStream(
  destination: DestinationStream | string,
  options?: { colorize?: boolean },
): DestinationStream {
  return pinoPretty({
    colorize: options?.colorize ?? false,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname,runtime,processType',
    destination,
    mkdir: true,
    append: true,
    // File paths need sync open so early process.exit does not race SonicBoom init.
    sync: typeof destination === 'string',
  })
}

/** Per-run agent log file destination (pretty text in dev, JSON lines in production). */
export function createAgentRunLogDestination(logFilePath: string): DestinationStream {
  if (usePrettyLogs()) {
    // pino-pretty requires a file path or Node Writable (with .on); the rotating
    // sync sink is pino-only and breaks pretty printing in development.
    return createPrettyLogStream(logFilePath)
  }
  return createRotatingPinoFileDestination(logFilePath)
}
