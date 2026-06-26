/** @deprecated Use google-workspace-settings and google-account-settings. */
export {
  GOOGLE_WORKSPACE_PROP_KEYS as GOOGLE_OAUTH_PROP_KEYS,
  isGoogleWorkspaceOAuthConfigured as isGoogleOAuthConfigured,
  isGoogleWorkspaceOAuthConfigured as isGoogleOAuthCredentialsConfigured,
  GoogleWorkspaceOAuthNotConfiguredError as GoogleOAuthNotConfiguredError,
  GOOGLE_WORKSPACE_OAUTH_NOT_CONFIGURED as GOOGLE_OAUTH_NOT_CONFIGURED,
} from './google-workspace-settings'

export {
  OPENFDE_GOOGLE_AUTH_LOGIN_URL_KEY,
  DEFAULT_OPENFDE_GOOGLE_AUTH_LOGIN_URL_DEV as DEFAULT_GOOGLE_AUTH_LOGIN_URL,
  isOpenFdeGoogleAccountSignInConfigured as isGoogleSignInConfigured,
  GOOGLE_ACCOUNT_NOT_CONFIGURED,
} from './google-account-settings'
