import type { SupportReportOptions, SupportReportResult } from '@shared/support-bundle'
import { buildSupportBundle } from './support-bundle-builder'
import { uploadSupportBundle } from './support-bundle-uploader'
import { getSupportConfig } from './support-config'
import {
  formatSupportUploadCooldownWait,
  getSupportUploadCooldownRemainingMs,
  getSupportUploadQuota,
  getSupportUploadUserKey,
  isSupportUploadCooldownActive,
  isSupportUploadDailyLimitReached,
  recordSupportBundleUpload,
} from './support-upload-tracker'
import { createLogger } from '@main/logger'

const log = createLogger('services.support-report')

function checkUploadAllowed(): SupportReportResult | null {
  const config = getSupportConfig()
  if (!config.uploadConfigured) return null

  const userKey = getSupportUploadUserKey()
  if (!userKey) {
    return {
      ok: false,
      reportId: '',
      error:
        'Sign in with your OpenFDE Google account before uploading a support report.',
    }
  }

  const quota = getSupportUploadQuota(userKey, config.maxUploadsPerDay)

  if (isSupportUploadDailyLimitReached(userKey, config.maxUploadsPerDay)) {
    return {
      ok: false,
      reportId: '',
      skipReason: 'daily_limit',
      uploadsRemainingToday: 0,
      error: `Daily support upload limit reached (${config.maxUploadsPerDay} per day). Try again tomorrow.`,
    }
  }

  if (isSupportUploadCooldownActive(userKey, config.uploadCooldownMinutes)) {
    const cooldownRemainingSeconds = Math.ceil(
      getSupportUploadCooldownRemainingMs(
        userKey,
        config.uploadCooldownMinutes,
      ) / 1000,
    )
    const waitLabel = formatSupportUploadCooldownWait(cooldownRemainingSeconds)
    log.info('Support upload blocked by cooldown', { cooldownRemainingSeconds })
    return {
      ok: false,
      reportId: '',
      skippedUpload: true,
      skipReason: 'cooldown',
      uploadsRemainingToday: quota.uploadsRemainingToday,
      uploadCooldownRemainingSeconds: cooldownRemainingSeconds,
      error: `Please wait ${waitLabel} before uploading another support report.`,
    }
  }

  return null
}

export async function submitSupportReport(
  options: SupportReportOptions,
): Promise<SupportReportResult> {
  try {
    if (options.upload) {
      const blocked = checkUploadAllowed()
      if (blocked) return blocked
    }

    const built = await buildSupportBundle(options)

    if (!options.upload) {
      return {
        ok: true,
        reportId: built.reportId,
        zipPath: built.zipPath,
        uploaded: false,
      }
    }

    const config = getSupportConfig()
    if (!config.uploadConfigured) {
      return {
        ok: true,
        reportId: built.reportId,
        zipPath: built.zipPath,
        uploaded: false,
        error:
          'Support bundle saved locally. Set BASE_API in env/.dev.env (or app.base.apiUrl) to enable upload.',
      }
    }

    const userKey = getSupportUploadUserKey()
    if (!userKey) {
      return {
        ok: false,
        reportId: built.reportId,
        zipPath: built.zipPath,
        error:
          'Sign in with your OpenFDE Google account before uploading a support report.',
      }
    }

    const quota = getSupportUploadQuota(userKey, config.maxUploadsPerDay)

    await uploadSupportBundle({
      uploadUrl: config.uploadUrl,
      zipPath: built.zipPath,
      reportId: built.reportId,
      comments: options.comments.trim(),
      manifest: built.manifest,
    })

    recordSupportBundleUpload({
      userKey,
      reportId: built.reportId,
    })

    const remainingAfter = Math.max(0, quota.uploadsRemainingToday - 1)
    log.info('Support report uploaded', {
      reportId: built.reportId,
      uploadsRemainingToday: remainingAfter,
    })
    return {
      ok: true,
      reportId: built.reportId,
      zipPath: built.zipPath,
      uploaded: true,
      uploadsRemainingToday: remainingAfter,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Support report failed'
    log.error('Support report failed', { err })
    return {
      ok: false,
      reportId: '',
      error: message,
    }
  }
}
