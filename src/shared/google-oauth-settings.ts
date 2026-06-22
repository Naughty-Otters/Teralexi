export const GOOGLE_OAUTH_PROP_KEYS = {
  clientId: 'app.google.clientId',
  clientSecret: 'app.google.clientSecret',
} as const

/** IPC / UI error code when OAuth client credentials are missing. */
export const GOOGLE_OAUTH_NOT_CONFIGURED = 'GOOGLE_OAUTH_NOT_CONFIGURED'

export function isGoogleOAuthConfigured(credentials: {
  clientId: string
  clientSecret?: string
}): boolean {
  return Boolean(credentials.clientId.trim())
}

export class GoogleOAuthNotConfiguredError extends Error {
  override readonly name = 'GoogleOAuthNotConfiguredError'

  constructor() {
    super(GOOGLE_OAUTH_NOT_CONFIGURED)
  }
}
