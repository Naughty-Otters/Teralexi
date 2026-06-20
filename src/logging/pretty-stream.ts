import type { DestinationStream } from 'pino'
import pino from 'pino'
import pinoPretty from 'pino-pretty'

/** True in local development — console and per-run agent logs use human-readable lines. */
export function usePrettyLogs(): boolean {
  return process.env.NODE_ENV === 'development'
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
    sync: false,
  })
}

/** Per-run agent log file destination (pretty text in dev, JSON lines in production). */
export function createAgentRunLogDestination(logFilePath: string): DestinationStream {
  if (usePrettyLogs()) {
    return createPrettyLogStream(logFilePath)
  }
  return pino.destination({
    dest: logFilePath,
    append: true,
    mkdir: true,
    sync: false,
  })
}
