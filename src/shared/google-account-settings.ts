export const OPENFDE_GOOGLE_AUTH_LOGIN_URL_KEY =
  'app.openfde.googleAuthLoginUrl' as const

/** Dev fallback when env file is not loaded (see env/.dev.env). */
export const DEFAULT_OPENFDE_GOOGLE_AUTH_LOGIN_URL_DEV =
  'http://localhost:8000/auth/login'

export const GOOGLE_ACCOUNT_NOT_CONFIGURED = 'GOOGLE_ACCOUNT_NOT_CONFIGURED'

export function isOpenFdeGoogleAccountSignInConfigured(authLoginUrl: string): boolean {
  return Boolean(authLoginUrl.trim())
}

export class GoogleAccountNotConfiguredError extends Error {
  override readonly name = 'GoogleAccountNotConfiguredError'

  constructor() {
    super(GOOGLE_ACCOUNT_NOT_CONFIGURED)
  }
}
