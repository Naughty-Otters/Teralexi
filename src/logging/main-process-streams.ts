import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getopenfdeLogsDir } from '@config/openfde-home'
import pino from 'pino'
import type { LogStreamSpec } from './pino-framework'
import { createPrettyLogStream, usePrettyLogs } from './pretty-stream'

let mainLogStreams: LogStreamSpec[] | null = null

export function buildMainProcessLogStreams(): LogStreamSpec[] {
  if (mainLogStreams) return mainLogStreams

  const logsDir = getopenfdeLogsDir()
  mkdirSync(logsDir, { recursive: true })

  const mainLogPath = join(logsDir, 'main.log')
  const fileStream = pino.destination({
    dest: mainLogPath,
    append: true,
    mkdir: true,
    sync: false,
  })

  const consoleOut = usePrettyLogs()
    ? createPrettyLogStream(process.stdout, { colorize: true })
    : process.stdout
  const consoleErr = usePrettyLogs()
    ? createPrettyLogStream(process.stderr, { colorize: true })
    : process.stderr

  mainLogStreams = [
    { stream: consoleOut, level: 'trace' },
    { stream: consoleErr, level: 'warn' },
    { stream: fileStream, level: 'trace' },
  ]

  return mainLogStreams
}
