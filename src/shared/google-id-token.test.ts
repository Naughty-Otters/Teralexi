import { describe, expect, it } from 'vitest'
import {
  decodeJwtPayload,
  googleProfileFromIdToken,
  isGoogleIdToken,
} from '@shared/google-id-token'

function makeTestJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.fake-signature`
}

describe('google-id-token', () => {
  it('decodes JWT payload', () => {
    const token = makeTestJwt({ sub: 'abc', email: 'a@b.com' })
    expect(decodeJwtPayload(token)).toMatchObject({
      sub: 'abc',
      email: 'a@b.com',
    })
  })

  it('detects Google ID tokens by issuer', () => {
    const token = makeTestJwt({
      sub: '1',
      iss: 'https://accounts.google.com',
    })
    expect(isGoogleIdToken(token)).toBe(true)
    expect(isGoogleIdToken('not-a-jwt')).toBe(false)
  })

  it('extracts profile claims from ID token', () => {
    const token = makeTestJwt({
      sub: 'user-1',
      email: 'user@gmail.com',
      name: 'User Name',
      picture: 'https://example.com/p.png',
      iss: 'https://accounts.google.com',
      exp: 1_700_000_000,
    })
    expect(googleProfileFromIdToken(token)).toEqual({
      sub: 'user-1',
      email: 'user@gmail.com',
      name: 'User Name',
      picture: 'https://example.com/p.png',
      expiresAtMs: 1_700_000_000_000,
    })
  })
})
