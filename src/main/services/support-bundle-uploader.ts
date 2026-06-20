import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { SupportBundleManifest } from '@shared/support-bundle'
import { createLogger } from '@main/logger'

const log = createLogger('services.support-bundle-uploader')

export async function uploadSupportBundle(args: {
  uploadUrl: string
  zipPath: string
  reportId: string
  comments: string
  manifest: SupportBundleManifest
}): Promise<void> {
  const buffer = readFileSync(args.zipPath)
  const form = new FormData()
  form.append('reportId', args.reportId)
  form.append('comments', args.comments)
  form.append('appVersion', args.manifest.appVersion)
  form.append('manifest', JSON.stringify(args.manifest))
  form.append(
    'bundle',
    new Blob([buffer], { type: 'application/zip' }),
    basename(args.zipPath),
  )

  log.info('Uploading support bundle', {
    reportId: args.reportId,
    uploadUrl: args.uploadUrl,
    bytes: buffer.byteLength,
  })

  const response = await fetch(args.uploadUrl, {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Upload failed (${response.status})${text ? `: ${text.slice(0, 240)}` : ''}`,
    )
  }
}
