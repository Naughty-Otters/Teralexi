/** Teralexi platform backend base URL (scheme + host + optional port). */
export const TERALEXI_BASE_API_URL_KEY = 'app.base.apiUrl'

export const TERALEXI_PLATFORM_PATHS = {
  graphql: 'graphql',
  googleAuthLogin: 'auth/login',
  supportUpload: 'support/upload',
  /** Public electron-updater generic feed (stable channel). */
  desktopReleases: 'desktop/releases/stable',
} as const

export function normalizeTeralexiBaseApiUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

export function joinTeralexiPlatformUrl(baseApi: string, path: string): string {
  const base = normalizeTeralexiBaseApiUrl(baseApi)
  if (!base) return ''
  const rel = path.trim().replace(/^\/+/, '')
  if (!rel) return base
  return `${base}/${rel}`
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

/**
 * Resolve a platform endpoint from BASE_API plus an optional override.
 * Override may be a relative path (`graphql`) or a legacy absolute URL.
 */
export function resolveTeralexiPlatformEndpoint(args: {
  baseApi: string
  configured: string
  defaultPath: string
}): string {
  const configured = args.configured.trim()
  const baseApi = normalizeTeralexiBaseApiUrl(args.baseApi)

  if (configured) {
    if (isAbsoluteHttpUrl(configured)) return configured
    if (baseApi) return joinTeralexiPlatformUrl(baseApi, configured)
    return ''
  }

  if (!baseApi) return ''
  return joinTeralexiPlatformUrl(baseApi, args.defaultPath)
}

/** @deprecated Prefer {@link normalizeTeralexiBaseApiUrl} or platform config getters. */
export function resolveMetricsApiBaseUrl(graphqlUrl: string): string {
  const trimmed = graphqlUrl.trim()
  if (!trimmed) return ''
  if (isAbsoluteHttpUrl(trimmed)) {
    try {
      return new URL(trimmed).origin
    } catch {
      return ''
    }
  }
  return ''
}
