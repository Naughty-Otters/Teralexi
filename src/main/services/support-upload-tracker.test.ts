import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

const logsDir = join(tmpdir(), `openfde-logs-test-${process.pid}`)

vi.mock('@config/openfde-home', () => ({
  getopenfdeLogsDir: () => logsDir,
}))

vi.mock('@main/services/google-account-oauth', () => ({
  loadStoredAccount: vi.fn(() => ({
    userInfo: { sub: 'google-user-1', email: 'user@example.com' },
  })),
}))

describe('support-upload-tracker', () => {
  afterEach(async () => {
    vi.resetModules()
    rmSync(logsDir, { recursive: true, force: true })
  })

  it('formats cooldown wait labels', async () => {
    const tracker = await import('./support-upload-tracker')
    expect(tracker.formatSupportUploadCooldownWait(45)).toBe('45s')
    expect(tracker.formatSupportUploadCooldownWait(90)).toBe('1m 30s')
    expect(tracker.formatSupportUploadCooldownWait(120)).toBe('2m')
  })

  it('enforces upload cooldown between uploads', async () => {
    const tracker = await import('./support-upload-tracker')
    mkdirSync(logsDir, { recursive: true })
    const uploadedAt = new Date('2026-06-28T12:00:00.000Z')
    const userKey = tracker.getSupportUploadUserKey()
    expect(userKey).toBe('google-user-1')

    expect(
      tracker.isSupportUploadCooldownActive(userKey!, 10, uploadedAt.getTime()),
    ).toBe(false)

    tracker.recordSupportBundleUpload({
      userKey: userKey!,
      reportId: 'report-1',
      uploadedAt,
    })

    const fiveMinutesLater = uploadedAt.getTime() + 5 * 60 * 1000
    expect(
      tracker.isSupportUploadCooldownActive(userKey!, 10, fiveMinutesLater),
    ).toBe(true)
    expect(
      tracker.getSupportUploadCooldownRemainingMs(
        userKey!,
        10,
        fiveMinutesLater,
      ),
    ).toBe(5 * 60 * 1000)

    const tenMinutesLater = uploadedAt.getTime() + 10 * 60 * 1000
    expect(
      tracker.isSupportUploadCooldownActive(userKey!, 10, tenMinutesLater),
    ).toBe(false)
  })

  it('enforces daily upload limit', async () => {
    const tracker = await import('./support-upload-tracker')
    mkdirSync(logsDir, { recursive: true })
    const now = new Date()
    const userKey = tracker.getSupportUploadUserKey()!
    const max = 5

    for (let i = 1; i <= max; i += 1) {
      tracker.recordSupportBundleUpload({
        userKey,
        reportId: `report-${i}`,
        uploadedAt: now,
      })
    }

    expect(tracker.getSupportUploadQuota(userKey, max).uploadsToday).toBe(max)
    expect(tracker.isSupportUploadDailyLimitReached(userKey, max)).toBe(true)
  })
})
