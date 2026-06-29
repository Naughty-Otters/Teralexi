import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getopenfdeLogsDir } from '@config/openfde-home'
import { loadStoredAccount } from '@main/services/google-account-oauth'
import { createLogger } from '@main/logger'

const log = createLogger('services.support-upload-tracker')

const TRACKER_VERSION = 1

type UserUploadRecord = {
  lastUploadedReportId?: string
  lastUploadedAt?: string
  /** Local calendar day (YYYY-MM-DD) -> upload count. */
  uploadDays: Record<string, number>
}

type SupportUploadTrackerState = {
  version: typeof TRACKER_VERSION
  users: Record<string, UserUploadRecord>
}

export type SupportUploadQuota = {
  maxUploadsPerDay: number
  uploadsToday: number
  uploadsRemainingToday: number
}

function trackerPath(): string {
  return join(getopenfdeLogsDir(), 'support-upload-tracker.json')
}

function ensureTrackerDir(): void {
  mkdirSync(getopenfdeLogsDir(), { recursive: true })
}

function emptyUserRecord(): UserUploadRecord {
  return { uploadDays: {} }
}

function loadState(): SupportUploadTrackerState {
  const path = trackerPath()
  if (!existsSync(path)) {
    return { version: TRACKER_VERSION, users: {} }
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as SupportUploadTrackerState
    if (parsed?.version !== TRACKER_VERSION || typeof parsed.users !== 'object') {
      return { version: TRACKER_VERSION, users: {} }
    }
    return parsed
  } catch (err) {
    log.warn('Failed to read support upload tracker; resetting', { err })
    return { version: TRACKER_VERSION, users: {} }
  }
}

function saveState(state: SupportUploadTrackerState): void {
  ensureTrackerDir()
  writeFileSync(trackerPath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

function getUserRecord(
  state: SupportUploadTrackerState,
  userKey: string,
): UserUploadRecord {
  return state.users[userKey] ?? emptyUserRecord()
}

export function localCalendarDayKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getSupportUploadUserKey(): string | null {
  const account = loadStoredAccount()
  const sub = account?.userInfo?.sub?.trim()
  if (sub) return sub
  const email = account?.userInfo?.email?.trim()
  return email || null
}

export function getSupportUploadQuota(
  userKey: string,
  maxUploadsPerDay: number,
): SupportUploadQuota {
  const state = loadState()
  const record = getUserRecord(state, userKey)
  const dayKey = localCalendarDayKey()
  const uploadsToday = record.uploadDays[dayKey] ?? 0
  const remaining = Math.max(0, maxUploadsPerDay - uploadsToday)
  return {
    maxUploadsPerDay,
    uploadsToday,
    uploadsRemainingToday: remaining,
  }
}

export function getSupportUploadCooldownRemainingMs(
  userKey: string,
  cooldownMinutes: number,
  now = Date.now(),
): number {
  const state = loadState()
  const record = getUserRecord(state, userKey)
  const lastUploadedAt = record.lastUploadedAt
  if (!lastUploadedAt) return 0

  const cooldownMs = Math.max(0, cooldownMinutes) * 60 * 1000
  if (cooldownMs === 0) return 0

  const elapsedMs = now - Date.parse(lastUploadedAt)
  if (!Number.isFinite(elapsedMs) || elapsedMs >= cooldownMs) return 0
  return cooldownMs - elapsedMs
}

export function isSupportUploadCooldownActive(
  userKey: string,
  cooldownMinutes: number,
  now = Date.now(),
): boolean {
  return getSupportUploadCooldownRemainingMs(userKey, cooldownMinutes, now) > 0
}

export function recordSupportBundleUpload(args: {
  userKey: string
  reportId: string
  uploadedAt?: Date
}): void {
  const uploadedAt = args.uploadedAt ?? new Date()
  const dayKey = localCalendarDayKey(uploadedAt)
  const state = loadState()
  const record = getUserRecord(state, args.userKey)

  record.lastUploadedReportId = args.reportId
  record.lastUploadedAt = uploadedAt.toISOString()
  record.uploadDays[dayKey] = (record.uploadDays[dayKey] ?? 0) + 1

  state.users[args.userKey] = record
  saveState(state)
}

export function isSupportUploadDailyLimitReached(
  userKey: string,
  maxUploadsPerDay: number,
): boolean {
  return getSupportUploadQuota(userKey, maxUploadsPerDay).uploadsRemainingToday <= 0
}

export function formatSupportUploadCooldownWait(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds))
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60)
    const remainder = seconds % 60
    return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`
  }
  return `${seconds}s`
}
