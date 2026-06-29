import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { SupportBundleManifest } from '@shared/support-bundle'
import { createLogger } from '@main/logger'
import { getOpenFdeBaseApiUrl } from './openfde-platform-config'
import { getOpenFdeServerAccessToken } from './openfde-server-auth'

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

  const apiBaseUrl = getOpenFdeBaseApiUrl()
  const bearerToken = await getOpenFdeServerAccessToken(apiBaseUrl)
  if (!bearerToken) {
    throw new Error(
      'Sign in with your OpenFDE Google account before uploading a support report.',
    )
  }

  const response = await fetch(args.uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
    },
    body: form,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Upload failed (${response.status})${text ? `: ${text.slice(0, 240)}` : ''}`,
    )
  }
}
