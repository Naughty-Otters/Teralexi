import type { SupportReportOptions, SupportReportResult } from '@shared/support-bundle'
import { buildSupportBundle } from './support-bundle-builder'
import { uploadSupportBundle } from './support-bundle-uploader'
import { getSupportConfig } from './support-config'
import { createLogger } from '@main/logger'

const log = createLogger('services.support-report')

export async function submitSupportReport(
  options: SupportReportOptions,
): Promise<SupportReportResult> {
  try {
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
          'Support bundle saved locally. Set app.support.uploadUrl in config.properties to enable upload.',
      }
    }

    await uploadSupportBundle({
      uploadUrl: config.uploadUrl,
      zipPath: built.zipPath,
      reportId: built.reportId,
      comments: options.comments.trim(),
      manifest: built.manifest,
    })

    log.info('Support report uploaded', { reportId: built.reportId })
    return {
      ok: true,
      reportId: built.reportId,
      zipPath: built.zipPath,
      uploaded: true,
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
