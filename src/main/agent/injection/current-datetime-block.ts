import type { ModelMessage } from '@teralexi-ai'
import { getLastDatetimeInjection } from './conversation-injection-state'
import { messagesContainCurrentDatetimeBlock } from './injection-message-content'

export type CurrentDatetimeBlockOptions = {
  now?: Date
  timeZone?: string
}

export type ShouldInjectCurrentDatetimeOptions = CurrentDatetimeBlockOptions & {
  conversationId?: string
  latestUserMessageId?: string
  latestUserMessageAt?: string
}

function resolveTimeZone(timeZone?: string): string {
  const trimmed = timeZone?.trim()
  if (trimmed) return trimmed
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function formatUtcOffset(now: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
    }).formatToParts(now)
    const offset = parts.find((part) => part.type === 'timeZoneName')?.value
    if (offset?.startsWith('GMT')) {
      return offset.replace('GMT', 'UTC')
    }
    if (offset) return offset
  } catch {
    // fall through
  }

  const offsetMinutes = -now.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hours = String(Math.floor(abs / 60)).padStart(2, '0')
  const minutes = String(abs % 60).padStart(2, '0')
  return `UTC${sign}${hours}:${minutes}`
}

export function calendarDayKey(
  value: Date | string,
  timeZone: string,
): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Instruction block with the agent run's current wall-clock context. */
export function formatCurrentDatetimeInstructionBlock(
  options: CurrentDatetimeBlockOptions = {},
): string {
  const now = options.now ?? new Date()
  const timeZone = resolveTimeZone(options.timeZone)
  const utc = now.toISOString()
  const local = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone,
  }).format(now)
  const offset = formatUtcOffset(now, timeZone)

  return [
    '## Current date and time',
    '',
    'Use this as the authoritative "now" for scheduling, deadlines, and relative dates.',
    'Do not guess the current date or timezone.',
    '',
    `- UTC (ISO 8601): ${utc}`,
    `- Local (${timeZone}): ${local}`,
    `- Timezone: ${timeZone} (${offset})`,
  ].join('\n')
}

export function shouldInjectCurrentDatetime(
  messages: readonly ModelMessage[],
  options: ShouldInjectCurrentDatetimeOptions = {},
): boolean {
  if (messagesContainCurrentDatetimeBlock(messages)) return false

  const conversationId = options.conversationId?.trim()
  if (!conversationId) return true

  const last = getLastDatetimeInjection(conversationId)
  if (!last) return true

  const turnId = options.latestUserMessageId?.trim()
  const now = options.now ?? new Date()
  const timeZone = resolveTimeZone(options.timeZone)
  const todayKey = calendarDayKey(now, timeZone)

  if (turnId && last.userMessageId) {
    if (turnId !== last.userMessageId) return true
    return last.dayKey !== todayKey
  }

  return last.dayKey !== todayKey
}
