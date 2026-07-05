/** Canonical Google Workspace OAuth keys — keep in sync with skills/google-workspace/properties.md */
export const GOOGLE_WORKSPACE_PROP_KEYS = {
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
  const clientId = (values[GOOGLE_WORKSPACE_PROP_KEYS.clientId] ?? '').trim()
  const clientSecret = (
    values[GOOGLE_WORKSPACE_PROP_KEYS.clientSecret] ?? ''
  ).trim()
  return { clientId, clientSecret }
}

export function googleWorkspaceOAuthConfiguredFromMap(
  values: Record<string, string>,
): boolean {
  return isGoogleWorkspaceOAuthConfigured(
    resolveGoogleWorkspaceCredentialsFromMap(values),
  )
}
