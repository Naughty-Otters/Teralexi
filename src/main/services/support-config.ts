import config from '@config/index'
import type { SupportConfig } from '@shared/support-bundle'
import {
  getOpenFdeBaseApiUrl,
  getOpenFdeSupportUploadUrl,
} from './openfde-platform-config'

export function getSupportConfig(): SupportConfig {
  const baseApiUrl = getOpenFdeBaseApiUrl()
  const uploadUrl = getOpenFdeSupportUploadUrl()
  return {
    baseApiUrl,
    uploadUrl,
    uploadConfigured: baseApiUrl.length > 0,
    maxMegabytes: Math.max(1, config.support.maxMegabytes),
  }
}

export function getSupportMaxBundleBytes(): number {
  return getSupportConfig().maxMegabytes * 1024 * 1024
}
