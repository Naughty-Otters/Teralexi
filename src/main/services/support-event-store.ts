import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getopenfdeLogsDir } from '@config/openfde-home'
import type { SupportClientErrorPayload } from '@shared/support-bundle'
import { createLogger } from '@main/logger'

const log = createLogger('services.support-event-store')

const MAX_RING = 50

export type SupportEventRecord = SupportClientErrorPayload & {
  id: string
  at: string
  source: 'renderer' | 'main'
}

const ring: SupportEventRecord[] = []

function eventsPath(): string {
  return join(getopenfdeLogsDir(), 'support-events.jsonl')
}

function ensureLogDir(): void {
  mkdirSync(getopenfdeLogsDir(), { recursive: true })
}

export function recordSupportEvent(
  source: 'renderer' | 'main',
  payload: SupportClientErrorPayload,
): void {
  const entry: SupportEventRecord = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    source,
    ...payload,
  }
  ring.push(entry)
  while (ring.length > MAX_RING) ring.shift()

  try {
    ensureLogDir()
    appendFileSync(eventsPath(), `${JSON.stringify(entry)}\n`, 'utf8')
  } catch (err) {
    log.warn('Failed to append support event', { err })
  }
}

export function listRecentSupportEvents(limit = MAX_RING): SupportEventRecord[] {
  return ring.slice(-limit)
}

export function readSupportEventsFile(): string {
  const path = eventsPath()
  if (!existsSync(path)) return ''
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

export function registerMainProcessSupportHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection'
    const stack = reason instanceof Error ? reason.stack : undefined
    recordSupportEvent('main', { message, stack })
  })

  process.on('uncaughtException', (err) => {
    recordSupportEvent('main', {
      message: err.message,
      stack: err.stack,
    })
  })
}
