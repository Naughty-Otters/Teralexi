import { describe, expect, it } from 'vitest'
import {
  OPENFDE_CALLBACK_URL,
  parseOpenFdeProtocolUrl,
} from '@shared/openfde-protocol'

describe('openfde-protocol', () => {
  it('parses openfde://open?token=xxx', () => {
    expect(parseOpenFdeProtocolUrl('openfde://open?token=abc123')).toEqual({
      type: 'open',
      accessToken: 'abc123',
      refreshToken: undefined,
      expiresIn: undefined,
      scope: undefined,
    })
  })

  it('parses access_token alias and optional params', () => {
    expect(
      parseOpenFdeProtocolUrl(
        'openfde://open?access_token=t1&refresh_token=r1&expires_in=7200&scope=email%20profile',
      ),
    ).toEqual({
      type: 'open',
      accessToken: 't1',
      refreshToken: 'r1',
      expiresIn: 7200,
      scope: 'email profile',
    })
  })

  it('parses id_token alias', () => {
    expect(parseOpenFdeProtocolUrl('openfde://open?id_token=jwt123')).toEqual({
      type: 'open',
      accessToken: 'jwt123',
      refreshToken: undefined,
      expiresIn: undefined,
      scope: undefined,
    })
  })

  it('returns null for unknown host or missing token', () => {
    expect(parseOpenFdeProtocolUrl('openfde://other?token=x')).toBeNull()
    expect(parseOpenFdeProtocolUrl('openfde://open')).toBeNull()
    expect(parseOpenFdeProtocolUrl('https://example.com')).toBeNull()
  })

  it('exports callback URL constant', () => {
    expect(OPENFDE_CALLBACK_URL).toBe('openfde://open')
  })
})
