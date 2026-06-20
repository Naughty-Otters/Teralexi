import config from '@config/index'
import type { SupportConfig } from '@shared/support-bundle'

export function getSupportConfig(): SupportConfig {
  const uploadUrl = config.support.uploadUrl.trim()
  return {
    uploadUrl,
    uploadConfigured: uploadUrl.length > 0,
    maxMegabytes: Math.max(1, config.support.maxMegabytes),
  }
}

export function getSupportMaxBundleBytes(): number {
  return getSupportConfig().maxMegabytes * 1024 * 1024
}
