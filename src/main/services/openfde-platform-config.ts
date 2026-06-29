import { getSystemPropValue } from '@config/system-prop'
import {
  OPENFDE_BASE_API_URL_KEY,
  OPENFDE_PLATFORM_PATHS,
  normalizeOpenFdeBaseApiUrl,
  resolveOpenFdePlatformEndpoint,
} from '@shared/openfde-platform-api'
import { OPENFDE_GOOGLE_AUTH_LOGIN_URL_KEY } from '@shared/google-account-settings'

const METRICS_GRAPHQL_URL_KEY = 'app.metrics.graphqlUrl'
const SUPPORT_UPLOAD_URL_KEY = 'app.support.uploadUrl'
const DESKTOP_RELEASES_URL_KEY = 'app.desktop.releasesUrl'
const DESKTOP_FORCE_DEV_UPDATE_KEY = 'app.desktop.forceDevUpdateConfig'

function parseBooleanProp(value: string, fallback = false): boolean {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return fallback
}

export function getOpenFdeBaseApiUrl(): string {
  return normalizeOpenFdeBaseApiUrl(
    getSystemPropValue(OPENFDE_BASE_API_URL_KEY, ''),
  )
}

export function getOpenFdeGraphqlUrl(): string {
  return resolveOpenFdePlatformEndpoint({
    baseApi: getOpenFdeBaseApiUrl(),
    configured: getSystemPropValue(METRICS_GRAPHQL_URL_KEY, ''),
    defaultPath: OPENFDE_PLATFORM_PATHS.graphql,
  })
}

export function getOpenFdeGoogleAuthLoginUrl(): string {
  return resolveOpenFdePlatformEndpoint({
    baseApi: getOpenFdeBaseApiUrl(),
    configured: getSystemPropValue(OPENFDE_GOOGLE_AUTH_LOGIN_URL_KEY, ''),
    defaultPath: OPENFDE_PLATFORM_PATHS.googleAuthLogin,
  })
}

export function getOpenFdeSupportUploadUrl(): string {
  return resolveOpenFdePlatformEndpoint({
    baseApi: getOpenFdeBaseApiUrl(),
    configured: getSystemPropValue(SUPPORT_UPLOAD_URL_KEY, ''),
    defaultPath: OPENFDE_PLATFORM_PATHS.supportUpload,
  })
}

/** Base URL for electron-updater `generic` feed (must end with `/`). */
export function getOpenFdeDesktopReleasesFeedUrl(): string {
  const resolved = resolveOpenFdePlatformEndpoint({
    baseApi: getOpenFdeBaseApiUrl(),
    configured: getSystemPropValue(DESKTOP_RELEASES_URL_KEY, ''),
    defaultPath: OPENFDE_PLATFORM_PATHS.desktopReleases,
  })
  if (!resolved) return ''
  return resolved.endsWith('/') ? resolved : `${resolved}/`
}

/** Opt-in: allow electron-updater in unpackaged dev (`npm run dev`). */
export function getOpenFdeDesktopForceDevUpdateConfig(): boolean {
  return parseBooleanProp(
    getSystemPropValue(DESKTOP_FORCE_DEV_UPDATE_KEY, 'false'),
    false,
  )
}
