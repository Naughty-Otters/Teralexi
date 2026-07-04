import type { DestinationStream } from 'pino'
import pino from 'pino'
import pinoPretty from 'pino-pretty'

/** True in local development — console and per-run agent logs use human-readable lines. */
export function usePrettyLogs(): boolean {
  return process.env.NODE_ENV === 'development'
}

/**
 * File-backed pino destination that is ready before the first write or process exit.
 * Async destinations (sync: false) can throw "sonic boom is not ready yet" when
 * Electron exits early — common on Windows first launch or second-instance quit.
 */
export function createPinoFileDestination(logFilePath: string): DestinationStream {
  return pino.destination({
    dest: logFilePath,
    append: true,
    mkdir: true,
    sync: true,
  })
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
    return createPrettyLogStream(logFilePath)
  }
  return createPinoFileDestination(logFilePath)
}
