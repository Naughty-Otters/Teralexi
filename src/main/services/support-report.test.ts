import { describe, expect, it, vi, beforeEach } from 'vitest'

const {
  buildSupportBundle,
  uploadSupportBundle,
  getSupportConfig,
  getSupportUploadUserKey,
  getSupportUploadQuota,
  isSupportUploadDailyLimitReached,
  isSupportUploadCooldownActive,
  getSupportUploadCooldownRemainingMs,
  recordSupportBundleUpload,
} = vi.hoisted(() => ({
  buildSupportBundle: vi.fn(),
  uploadSupportBundle: vi.fn(),
  getSupportConfig: vi.fn(),
  getSupportUploadUserKey: vi.fn(),
  getSupportUploadQuota: vi.fn(),
  isSupportUploadDailyLimitReached: vi.fn(),
  isSupportUploadCooldownActive: vi.fn(),
  getSupportUploadCooldownRemainingMs: vi.fn(),
  recordSupportBundleUpload: vi.fn(),
}))

vi.mock('./support-bundle-builder', () => ({
  buildSupportBundle,
}))

vi.mock('./support-bundle-uploader', () => ({
  uploadSupportBundle,
}))

vi.mock('./support-config', () => ({
  getSupportConfig,
}))

vi.mock('./support-upload-tracker', () => ({
  formatSupportUploadCooldownWait: (seconds: number) => `${seconds}s`,
  getSupportUploadCooldownRemainingMs,
  getSupportUploadQuota,
  getSupportUploadUserKey,
  isSupportUploadCooldownActive,
  isSupportUploadDailyLimitReached,
  recordSupportBundleUpload,
}))

vi.mock('./entitlement-session', () => ({
  isEntitlementFeatureAllowed: vi.fn(() => true),
}))

import { submitSupportReport } from './support-report'

const built = {
  reportId: 'report-123',
  zipPath: '/tmp/report-123.zip',
  manifest: { version: 1 },
}

describe('submitSupportReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildSupportBundle.mockResolvedValue(built)
    uploadSupportBundle.mockResolvedValue(undefined)
    getSupportConfig.mockReturnValue({
      uploadConfigured: true,
      uploadUrl: 'https://api.test/upload',
      maxUploadsPerDay: 5,
      uploadCooldownMinutes: 10,
    })
    getSupportUploadUserKey.mockReturnValue('google-user-1')
    getSupportUploadQuota.mockReturnValue({
      uploadsToday: 1,
      uploadsRemainingToday: 4,
    })
    isSupportUploadDailyLimitReached.mockReturnValue(false)
    isSupportUploadCooldownActive.mockReturnValue(false)
  })

  it('builds a local bundle without uploading', async () => {
    const result = await submitSupportReport({
      comments: 'Something broke',
      upload: false,
    })

    expect(result).toEqual({
      ok: true,
      reportId: 'report-123',
      zipPath: '/tmp/report-123.zip',
      uploaded: false,
    })
    expect(buildSupportBundle).toHaveBeenCalled()
    expect(uploadSupportBundle).not.toHaveBeenCalled()
  })

  it('blocks upload when user is not signed in', async () => {
    getSupportUploadUserKey.mockReturnValue(null)

    const result = await submitSupportReport({
      comments: 'Need help',
      upload: true,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('Sign in')
    expect(buildSupportBundle).not.toHaveBeenCalled()
  })

  it('blocks upload when daily limit is reached', async () => {
    isSupportUploadDailyLimitReached.mockReturnValue(true)

    const result = await submitSupportReport({
      comments: 'Need help',
      upload: true,
    })

    expect(result).toMatchObject({
      ok: false,
      skipReason: 'daily_limit',
      uploadsRemainingToday: 0,
    })
    expect(buildSupportBundle).not.toHaveBeenCalled()
  })

  it('blocks upload during cooldown', async () => {
    isSupportUploadCooldownActive.mockReturnValue(true)
    getSupportUploadCooldownRemainingMs.mockReturnValue(45_000)

    const result = await submitSupportReport({
      comments: 'Need help',
      upload: true,
    })

    expect(result).toMatchObject({
      ok: false,
      skippedUpload: true,
      skipReason: 'cooldown',
      uploadCooldownRemainingSeconds: 45,
      uploadsRemainingToday: 4,
    })
    expect(buildSupportBundle).not.toHaveBeenCalled()
  })

  it('uploads bundle and records quota usage', async () => {
    const result = await submitSupportReport({
      comments: 'Need help',
      upload: true,
    })

    expect(uploadSupportBundle).toHaveBeenCalledWith({
      uploadUrl: 'https://api.test/upload',
      zipPath: built.zipPath,
      reportId: built.reportId,
      comments: 'Need help',
      manifest: built.manifest,
    })
    expect(recordSupportBundleUpload).toHaveBeenCalledWith({
      userKey: 'google-user-1',
      reportId: built.reportId,
    })
    expect(result).toEqual({
      ok: true,
      reportId: built.reportId,
      zipPath: built.zipPath,
      uploaded: true,
      uploadsRemainingToday: 3,
    })
  })

  it('saves locally when upload is not configured after build', async () => {
    getSupportConfig
      .mockReturnValueOnce({
        uploadConfigured: true,
        maxUploadsPerDay: 5,
        uploadCooldownMinutes: 10,
      })
      .mockReturnValueOnce({
        uploadConfigured: false,
        uploadUrl: '',
        maxUploadsPerDay: 5,
        uploadCooldownMinutes: 10,
      })

    const result = await submitSupportReport({
      comments: 'Need help',
      upload: true,
    })

    expect(result).toMatchObject({
      ok: true,
      uploaded: false,
      zipPath: built.zipPath,
    })
    expect(result.error).toContain('saved locally')
    expect(uploadSupportBundle).not.toHaveBeenCalled()
  })

  it('returns build failures as report errors', async () => {
    buildSupportBundle.mockRejectedValue(new Error('zip failed'))

    const result = await submitSupportReport({
      comments: 'Need help',
      upload: false,
    })

    expect(result).toEqual({
      ok: false,
      reportId: '',
      error: 'zip failed',
    })
  })
})
