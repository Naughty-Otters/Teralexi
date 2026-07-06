import { getSystemPropValue } from '@config/system-prop'
import {
  TERALEXI_BASE_API_URL_KEY,
  TERALEXI_PLATFORM_PATHS,
  normalizeTeralexiBaseApiUrl,
  resolveTeralexiPlatformEndpoint,
} from '@shared/teralexi-platform-api'
import { TERALEXI_GOOGLE_AUTH_LOGIN_URL_KEY } from '@shared/google-account-settings'

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

export function getTeralexiBaseApiUrl(): string {
  return normalizeTeralexiBaseApiUrl(
    getSystemPropValue(TERALEXI_BASE_API_URL_KEY, ''),
  )
}

export function getTeralexiGraphqlUrl(): string {
  return resolveTeralexiPlatformEndpoint({
    baseApi: getTeralexiBaseApiUrl(),
    configured: getSystemPropValue(METRICS_GRAPHQL_URL_KEY, ''),
    defaultPath: TERALEXI_PLATFORM_PATHS.graphql,
  })
}

export function getTeralexiGoogleAuthLoginUrl(): string {
  return resolveTeralexiPlatformEndpoint({
    baseApi: getTeralexiBaseApiUrl(),
    configured: getSystemPropValue(TERALEXI_GOOGLE_AUTH_LOGIN_URL_KEY, ''),
    defaultPath: TERALEXI_PLATFORM_PATHS.googleAuthLogin,
  })
}

export function getTeralexiSupportUploadUrl(): string {
  return resolveTeralexiPlatformEndpoint({
    baseApi: getTeralexiBaseApiUrl(),
    configured: getSystemPropValue(SUPPORT_UPLOAD_URL_KEY, ''),
    defaultPath: TERALEXI_PLATFORM_PATHS.supportUpload,
  })
}

/** Base URL for electron-updater `generic` feed (must end with `/`). */
export function getTeralexiDesktopReleasesFeedUrl(): string {
  const resolved = resolveTeralexiPlatformEndpoint({
    baseApi: getTeralexiBaseApiUrl(),
    configured: getSystemPropValue(DESKTOP_RELEASES_URL_KEY, ''),
    defaultPath: TERALEXI_PLATFORM_PATHS.desktopReleases,
  })
  if (!resolved) return ''
  return resolved.endsWith('/') ? resolved : `${resolved}/`
}

/** Opt-in: allow electron-updater in unpackaged dev (`npm run dev`). */
export function getTeralexiDesktopForceDevUpdateConfig(): boolean {
  return parseBooleanProp(
    getSystemPropValue(DESKTOP_FORCE_DEV_UPDATE_KEY, 'false'),
    false,
  )
}
