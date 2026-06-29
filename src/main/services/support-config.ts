import config from '@config/index'
import type { SupportConfig } from '@shared/support-bundle'
import {
  getOpenFdeBaseApiUrl,
  getOpenFdeSupportUploadUrl,
} from './openfde-platform-config'
import {
  getSupportUploadQuota,
  getSupportUploadUserKey,
} from './support-upload-tracker'

export function getSupportConfig(): SupportConfig {
  const baseApiUrl = getOpenFdeBaseApiUrl()
  const uploadUrl = getOpenFdeSupportUploadUrl()
  const maxUploadsPerDay = Math.max(1, config.support.maxUploadsPerDay)
  const uploadCooldownMinutes = Math.max(0, config.support.uploadCooldownMinutes)
  const userKey = getSupportUploadUserKey()
  const quota = userKey
    ? getSupportUploadQuota(userKey, maxUploadsPerDay)
    : null

  return {
    baseApiUrl,
    uploadUrl,
    uploadConfigured: baseApiUrl.length > 0,
    maxMegabytes: Math.max(1, config.support.maxMegabytes),
    maxUploadsPerDay,
    uploadCooldownMinutes,
    uploadsToday: quota?.uploadsToday,
    uploadsRemainingToday: quota?.uploadsRemainingToday,
  }
}

export function getSupportMaxBundleBytes(): number {
  return getSupportConfig().maxMegabytes * 1024 * 1024
}
