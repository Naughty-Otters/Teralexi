import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getTeralexiLogsDir } from '@config/teralexi-home'
import type { LogStreamSpec } from './pino-framework'
import { createPinoFileDestination, createPrettyLogStream, usePrettyLogs } from './pretty-stream'

let mainLogStreams: LogStreamSpec[] | null = null

export function buildMainProcessLogStreams(): LogStreamSpec[] {
  if (mainLogStreams) return mainLogStreams

  const logsDir = getTeralexiLogsDir()
  mkdirSync(logsDir, { recursive: true })

  const mainLogPath = join(logsDir, 'main.log')
  const fileStream = createPinoFileDestination(mainLogPath)

  const consoleOut = usePrettyLogs()
    ? createPrettyLogStream(process.stdout, { colorize: true })
    : process.stdout
  const consoleErr = usePrettyLogs()
    ? createPrettyLogStream(process.stderr, { colorize: true })
    : process.stderr

  mainLogStreams = [
    { stream: consoleOut, level: 'trace' },
    { stream: consoleErr, level: 'warn' },
    { stream: fileStream, level: 'info' },
  ]

  return mainLogStreams
}
