/** Decode a JWT payload without signature verification (external auth server). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    let base64 = parts[1]!
    base64 = base64.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4) base64 += '='
    const json = Buffer.from(base64, 'base64').toString('utf8')
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export function isGoogleIdToken(token: string): boolean {
  const payload = decodeJwtPayload(token)
  if (!payload) return false
  const iss = payload.iss
  return typeof iss === 'string' && iss.includes('accounts.google.com')
}

export type GoogleIdTokenProfile = {
  sub: string
  email: string
  name: string
  picture: string
  expiresAtMs?: number
}

/** Extract Google profile claims from an ID token JWT. */
export function googleProfileFromIdToken(token: string): GoogleIdTokenProfile | null {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload.sub !== 'string') return null

  const email = typeof payload.email === 'string' ? payload.email : ''
  const name =
    typeof payload.name === 'string'
      ? payload.name
      : typeof payload.given_name === 'string'
        ? payload.given_name
        : email
  const picture = typeof payload.picture === 'string' ? payload.picture : ''

  let expiresAtMs: number | undefined
  if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
    expiresAtMs = payload.exp * 1000
  }

  return { sub: payload.sub, email, name, picture, expiresAtMs }
}
