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
