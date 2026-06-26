/** Google Workspace OAuth credentials (Settings → General → Google Workspace). */
export const GOOGLE_WORKSPACE_PROP_KEYS = {
  clientId: 'app.google.workspace.clientId',
  clientSecret: 'app.google.workspace.clientSecret',
} as const

/** @deprecated Read fallback when migrating from pre-workspace key names. */
export const LEGACY_GOOGLE_WORKSPACE_PROP_KEYS = {
  clientId: 'app.google.clientId',
  clientSecret: 'app.google.clientSecret',
} as const

export const GOOGLE_WORKSPACE_OAUTH_NOT_CONFIGURED =
  'GOOGLE_WORKSPACE_OAUTH_NOT_CONFIGURED'

export function isGoogleWorkspaceOAuthConfigured(credentials: {
  clientId: string
  clientSecret?: string
}): boolean {
  return Boolean(credentials.clientId.trim())
}

export class GoogleWorkspaceOAuthNotConfiguredError extends Error {
  override readonly name = 'GoogleWorkspaceOAuthNotConfiguredError'

  constructor() {
    super(GOOGLE_WORKSPACE_OAUTH_NOT_CONFIGURED)
  }
}

export function resolveGoogleWorkspaceCredentialsFromMap(
  values: Record<string, string>,
): { clientId: string; clientSecret: string } {
  const clientId =
    (values[GOOGLE_WORKSPACE_PROP_KEYS.clientId] ??
      values[LEGACY_GOOGLE_WORKSPACE_PROP_KEYS.clientId] ??
      '').trim()
  const clientSecret =
    (values[GOOGLE_WORKSPACE_PROP_KEYS.clientSecret] ??
      values[LEGACY_GOOGLE_WORKSPACE_PROP_KEYS.clientSecret] ??
      '').trim()
  return { clientId, clientSecret }
}
