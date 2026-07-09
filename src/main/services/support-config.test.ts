import { describe, expect, it, vi } from 'vitest'

vi.mock('./teralexi-platform-config', () => ({
  getTeralexiBaseApiUrl: () => 'https://api.teralexi.test',
  getTeralexiSupportUploadUrl: () => 'https://api.teralexi.test/support/upload',
}))

vi.mock('./support-upload-tracker', () => ({
  getSupportUploadUserKey: () => 'google-user-1',
  getSupportUploadQuota: () => ({
    uploadsToday: 2,
    uploadsRemainingToday: 3,
  }),
}))

import { getSupportConfig, getSupportMaxBundleBytes } from './support-config'

describe('support-config', () => {
  it('builds support config with upload quota', () => {
    expect(getSupportConfig()).toEqual({
      baseApiUrl: 'https://api.teralexi.test',
      uploadUrl: 'https://api.teralexi.test/support/upload',
      uploadConfigured: true,
      maxMegabytes: expect.any(Number),
      maxUploadsPerDay: expect.any(Number),
      uploadCooldownMinutes: expect.any(Number),
      uploadsToday: 2,
      uploadsRemainingToday: 3,
    })
  })

  it('derives max bundle bytes from megabyte limit', () => {
    const config = getSupportConfig()
    expect(getSupportMaxBundleBytes()).toBe(config.maxMegabytes * 1024 * 1024)
  })
})
