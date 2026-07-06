import { describe, expect, it } from 'vitest'
import {
  TERALEXI_CALLBACK_URL,
  parseTeralexiProtocolUrl,
} from '@shared/teralexi-protocol'

describe('teralexi-protocol', () => {
  it('parses teralexi://open?token=xxx', () => {
    expect(parseTeralexiProtocolUrl('teralexi://open?token=abc123')).toEqual({
      type: 'open',
      accessToken: 'abc123',
      refreshToken: undefined,
      expiresIn: undefined,
      scope: undefined,
    })
  })

  it('parses access_token alias and optional params', () => {
    expect(
      parseTeralexiProtocolUrl(
        'teralexi://open?access_token=t1&refresh_token=r1&expires_in=7200&scope=email%20profile',
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
    expect(parseTeralexiProtocolUrl('teralexi://open?id_token=jwt123')).toEqual({
      type: 'open',
      accessToken: 'jwt123',
      refreshToken: undefined,
      expiresIn: undefined,
      scope: undefined,
    })
  })

  it('returns null for unknown host or missing token', () => {
    expect(parseTeralexiProtocolUrl('teralexi://other?token=x')).toBeNull()
    expect(parseTeralexiProtocolUrl('teralexi://open')).toBeNull()
    expect(parseTeralexiProtocolUrl('https://example.com')).toBeNull()
  })

  it('exports callback URL constant', () => {
    expect(TERALEXI_CALLBACK_URL).toBe('teralexi://open')
  })
})
