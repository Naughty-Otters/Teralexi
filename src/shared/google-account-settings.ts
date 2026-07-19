export const TERALEXI_GOOGLE_AUTH_LOGIN_URL_KEY =
  'app.teralexi.googleAuthLoginUrl' as const

/** Fallback when env file is not loaded (defaults to production; see env/.dev.env). */
export const DEFAULT_TERALEXI_GOOGLE_AUTH_LOGIN_URL_DEV =
  'https://api.teralexi.com/auth/login'

export const GOOGLE_ACCOUNT_NOT_CONFIGURED = 'GOOGLE_ACCOUNT_NOT_CONFIGURED'

export function isTeralexiGoogleAccountSignInConfigured(authLoginUrl: string): boolean {
  return Boolean(authLoginUrl.trim())
}

export class GoogleAccountNotConfiguredError extends Error {
  override readonly name = 'GoogleAccountNotConfiguredError'

  constructor() {
    super(GOOGLE_ACCOUNT_NOT_CONFIGURED)
  }
}
