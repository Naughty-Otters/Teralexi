import { readFileSync, statSync } from 'node:fs'
import { createLogger } from '@main/logger'
import {
  APP_WEB_PUBLISH_DEFAULT_LIMITS,
  APP_WEB_PUBLISH_LIMIT_KEYS,
  ENTITLEMENT_FEATURES,
} from '@shared/subscription/entitlement-types'
import { hasCachedEntitlementFeature } from '@shared/subscription/entitlement-features'
import {
  joinTeralexiPlatformUrl,
  TERALEXI_PLATFORM_PATHS,
} from '@shared/teralexi-platform-api'
import { getTeralexiBaseApiUrl } from './teralexi-platform-config'
import { getTeralexiServerAccessToken } from './teralexi-server-auth'
import { getEntitlementCache } from './entitlement-store'
import {
  zipDisplayName,
  zipStaticSiteDirectory,
  type ZipStaticSiteResult,
} from './app-web-site-zip'

const log = createLogger('services.app-web-publish')

export type AppWebPublishSuccess = {
  ok: true
  userId: number
  url: string
  absoluteUrl: string
  fileCount: number
  bytes: number
}

export type AppWebPublishFailure = {
  ok: false
  error: string
  status?: number
  code?:
    | 'not_signed_in'
    | 'feature_missing'
    | 'size_limit'
    | 'weekly_limit'
    | 'validation'
    | 'unauthorized'
    | 'forbidden'
    | 'network'
    | 'server'
}

export type AppWebPublishResult = AppWebPublishSuccess | AppWebPublishFailure

export function getAppWebMaxUploadBytes(
  limits: Record<string, unknown> | null | undefined = getEntitlementCache()
    ?.limits,
): number {
  const raw = limits?.[APP_WEB_PUBLISH_LIMIT_KEYS.MAX_UPLOAD_BYTES]
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (Number.isFinite(n) && n > 0) return Math.trunc(n)
  return APP_WEB_PUBLISH_DEFAULT_LIMITS.maxUploadBytes
}

export function resolveAppWebUploadUrl(origin = getTeralexiBaseApiUrl()): string {
  return joinTeralexiPlatformUrl(origin, TERALEXI_PLATFORM_PATHS.appWebUpload)
}

export function toAbsoluteAppWebUrl(
  relativeUrl: string,
  origin = getTeralexiBaseApiUrl(),
): string {
  return new URL(relativeUrl, `${origin.replace(/\/+$/, '')}/`).href
}

function parseDetail(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  try {
    const json = JSON.parse(trimmed) as { detail?: unknown }
    if (typeof json.detail === 'string' && json.detail.trim()) {
      return json.detail.trim()
    }
  } catch {
    /* not JSON */
  }
  return trimmed.slice(0, 400)
}

/**
 * Upload a static site zip to `POST /api/v1/app/web/upload`.
 * Uses `redirect: 'manual'` so weekly quota `303` is detectable.
 */
export async function publishStaticSiteZip(args: {
  zipBuffer: Buffer
  filename?: string
  origin?: string
  accessToken?: string | null
  maxBytes?: number
}): Promise<AppWebPublishResult> {
  const origin = (args.origin ?? getTeralexiBaseApiUrl()).trim()
  if (!origin) {
    return {
      ok: false,
      code: 'network',
      error:
        'Teralexi API base URL is not configured (set BASE_API / app.base.apiUrl).',
    }
  }

  const cache = getEntitlementCache()
  if (!hasCachedEntitlementFeature(cache, ENTITLEMENT_FEATURES.APP_WEB_PUBLISH)) {
    return {
      ok: false,
      code: 'feature_missing',
      status: 403,
      error:
        'Your plan does not include website publishing (app.web.publish). Upgrade your plan or sign in again after entitlements refresh.',
    }
  }

  const accessToken =
    args.accessToken !== undefined
      ? args.accessToken
      : await getTeralexiServerAccessToken(origin)
  if (!accessToken?.trim()) {
    return {
      ok: false,
      code: 'not_signed_in',
      status: 401,
      error:
        'Sign in with your Teralexi Google account before publishing a website.',
    }
  }

  const maxBytes = args.maxBytes ?? getAppWebMaxUploadBytes()
  const bytes = args.zipBuffer.byteLength
  if (bytes > maxBytes) {
    return {
      ok: false,
      code: 'size_limit',
      status: 413,
      error: `Zip ${bytes} bytes exceeds plan limit of ${maxBytes} bytes. Reduce assets or omit node_modules/source maps.`,
    }
  }

  const uploadUrl = resolveAppWebUploadUrl(origin)
  const filename = args.filename?.trim() || 'site.zip'
  const form = new FormData()
  form.append(
    'file',
    new Blob([args.zipBuffer], { type: 'application/zip' }),
    filename.endsWith('.zip') ? filename : `${filename}.zip`,
  )

  log.info('Publishing static site', { uploadUrl, bytes, filename })

  let response: Response
  try {
    response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
      redirect: 'manual',
    })
  } catch (err) {
    return {
      ok: false,
      code: 'network',
      error: err instanceof Error ? err.message : String(err),
    }
  }

  if (response.status === 303 || response.status === 302) {
    const loc = response.headers.get('Location') ?? ''
    if (loc.includes('/app/web/limit-reached')) {
      return {
        ok: false,
        code: 'weekly_limit',
        status: 303,
        error:
          'Weekly publish limit reached. Open /app/web/limit-reached or upgrade your plan. Do not retry immediately.',
      }
    }
  }

  if (response.status === 401) {
    return {
      ok: false,
      code: 'unauthorized',
      status: 401,
      error: 'Session expired. Sign in again and retry publish.',
    }
  }

  if (response.status === 403) {
    const detail = parseDetail(await response.text().catch(() => ''))
    return {
      ok: false,
      code: 'forbidden',
      status: 403,
      error: detail || 'Publishing is not allowed on the current plan.',
    }
  }

  if (response.status === 413) {
    const detail = parseDetail(await response.text().catch(() => ''))
    return {
      ok: false,
      code: 'size_limit',
      status: 413,
      error: detail || `Upload exceeds size limit of ${maxBytes} bytes.`,
    }
  }

  if (response.status === 400) {
    const detail = parseDetail(await response.text().catch(() => ''))
    return {
      ok: false,
      code: 'validation',
      status: 400,
      error: detail || 'Invalid zip (need root index.html and valid paths).',
    }
  }

  if (!response.ok) {
    const detail = parseDetail(await response.text().catch(() => ''))
    return {
      ok: false,
      code: 'server',
      status: response.status,
      error: detail || `Publish failed with HTTP ${response.status}`,
    }
  }

  let body: {
    user_id?: number
    url?: string
    file_count?: number
    bytes?: number
  }
  try {
    body = (await response.json()) as typeof body
  } catch {
    return {
      ok: false,
      code: 'server',
      status: response.status,
      error: 'Publish succeeded but response JSON was invalid.',
    }
  }

  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!url) {
    return {
      ok: false,
      code: 'server',
      error: 'Publish response missing url.',
    }
  }

  return {
    ok: true,
    userId: typeof body.user_id === 'number' ? body.user_id : 0,
    url,
    absoluteUrl: toAbsoluteAppWebUrl(url, origin),
    fileCount: typeof body.file_count === 'number' ? body.file_count : 0,
    bytes: typeof body.bytes === 'number' ? body.bytes : bytes,
  }
}

export async function publishStaticSiteDirectory(args: {
  siteDir: string
  verify?: boolean
  origin?: string
}): Promise<
  AppWebPublishResult & {
    zipFileCount?: number
    verifyStatus?: number
  }
> {
  const zipped: ZipStaticSiteResult = zipStaticSiteDirectory(args.siteDir)
  if (!zipped.ok) {
    return { ok: false, code: 'validation', error: zipped.error }
  }

  const published = await publishStaticSiteZip({
    zipBuffer: zipped.buffer,
    filename: zipDisplayName(args.siteDir),
    origin: args.origin,
  })
  if (!published.ok) return published

  let verifyStatus: number | undefined
  if (args.verify) {
    try {
      const res = await fetch(published.absoluteUrl, { method: 'GET' })
      verifyStatus = res.status
    } catch {
      verifyStatus = 0
    }
  }

  return {
    ...published,
    zipFileCount: zipped.fileCount,
    ...(verifyStatus !== undefined ? { verifyStatus } : {}),
  }
}

/** Read zip from disk and publish (for tests / CLI). */
export async function publishStaticSiteZipPath(args: {
  zipPath: string
  origin?: string
}): Promise<AppWebPublishResult> {
  const size = statSync(args.zipPath).size
  const maxBytes = getAppWebMaxUploadBytes()
  if (size > maxBytes) {
    return {
      ok: false,
      code: 'size_limit',
      status: 413,
      error: `Zip ${size} bytes exceeds plan limit of ${maxBytes} bytes.`,
    }
  }
  const zipBuffer = readFileSync(args.zipPath)
  return publishStaticSiteZip({
    zipBuffer,
    filename: zipDisplayName(args.zipPath),
    origin: args.origin,
  })
}
