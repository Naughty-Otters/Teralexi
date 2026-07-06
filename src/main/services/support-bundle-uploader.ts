import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { SupportBundleManifest } from '@shared/support-bundle'
import { createLogger } from '@main/logger'
import { getTeralexiBaseApiUrl } from './teralexi-platform-config'
import { getTeralexiServerAccessToken } from './teralexi-server-auth'

const log = createLogger('services.support-bundle-uploader')

/** Server storage key: letters, numbers, dots, underscores, hyphens only. */
const SUPPORT_UPLOAD_LOCATION_RE = /^[A-Za-z0-9._-]+$/

export function sanitizeSupportUploadLocation(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('Support upload location is empty.')
  }
  if (SUPPORT_UPLOAD_LOCATION_RE.test(trimmed)) {
    return trimmed
  }
  const sanitized = trimmed
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (sanitized && SUPPORT_UPLOAD_LOCATION_RE.test(sanitized)) {
    return sanitized
  }
  throw new Error(
    'Support upload location must contain only letters, numbers, dots, underscores, and hyphens.',
  )
}

export function buildSupportUploadFormData(args: {
  zipPath: string
  zipBuffer?: Buffer
  reportId: string
  comments: string
  manifest: SupportBundleManifest
}): FormData {
  const buffer = args.zipBuffer ?? readFileSync(args.zipPath)
  const form = new FormData()
  const location = sanitizeSupportUploadLocation(args.reportId)

  // Platform API contract: `location` = storage key, `file` = zip payload.
  form.append('location', location)
  form.append(
    'file',
    new Blob([buffer], { type: 'application/zip' }),
    basename(args.zipPath),
  )

  // Optional metadata for server-side indexing (ignored if unsupported).
  form.append('reportId', args.reportId)
  form.append('comments', args.comments)
  form.append('appVersion', args.manifest.appVersion)
  form.append('manifest', JSON.stringify(args.manifest))

  return form
}

export async function uploadSupportBundle(args: {
  uploadUrl: string
  zipPath: string
  reportId: string
  comments: string
  manifest: SupportBundleManifest
}): Promise<void> {
  const buffer = readFileSync(args.zipPath)
  const form = buildSupportUploadFormData({ ...args, zipBuffer: buffer })

  log.info('Uploading support bundle', {
    reportId: args.reportId,
    uploadUrl: args.uploadUrl,
    bytes: buffer.byteLength,
  })

  const apiBaseUrl = getTeralexiBaseApiUrl()
  const bearerToken = await getTeralexiServerAccessToken(apiBaseUrl)
  if (!bearerToken) {
    throw new Error(
      'Sign in with your Teralexi Google account before uploading a support report.',
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
