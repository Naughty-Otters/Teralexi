import { describe, expect, it } from 'vitest'
import {
  GOOGLE_OAUTH_NOT_CONFIGURED,
  GoogleOAuthNotConfiguredError,
  isGoogleOAuthConfigured,
} from './google-oauth-settings'

describe('google-oauth-settings', () => {
  it('isGoogleOAuthConfigured requires a client ID', () => {
    expect(isGoogleOAuthConfigured({ clientId: 'id', clientSecret: '' })).toBe(
      true,
    )
    expect(isGoogleOAuthConfigured({ clientId: '  ', clientSecret: 'sec' })).toBe(
      false,
    )
  })

  it('GoogleOAuthNotConfiguredError uses stable code message', () => {
    const err = new GoogleOAuthNotConfiguredError()
    expect(err.message).toBe(GOOGLE_OAUTH_NOT_CONFIGURED)
  })
})
