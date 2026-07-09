import { getSystemPropValue } from '@config/system-prop'
import { readBakedEntitlementPublicKeyPem } from '@config/baked-app-env'

export const ENTITLEMENT_SIGNING_PUBLIC_KEY_PEM_KEY =
  'app.entitlement.signingPublicKeyPem'

function stripWrappingQuotes(raw: string): string {
  const trimmed = raw.trim()
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** Normalize PEM from env (`\n` escapes) for crypto import. */
export function normalizeEntitlementPublicKeyPem(raw: string): string {
  let trimmed = stripWrappingQuotes(raw)
  if (!trimmed) return ''
  if (trimmed.includes('\\n')) {
    trimmed = trimmed.replace(/\\n/g, '\n')
  }
  return trimmed
}

export function getEntitlementSigningPublicKeyPem(): string {
  const fromProp = getSystemPropValue(ENTITLEMENT_SIGNING_PUBLIC_KEY_PEM_KEY, '')
  if (fromProp.trim()) {
    return normalizeEntitlementPublicKeyPem(fromProp)
  }
  return normalizeEntitlementPublicKeyPem(
    readBakedEntitlementPublicKeyPem(process.env),
  )
}

export function isEntitlementVerificationConfigured(): boolean {
  return getEntitlementSigningPublicKeyPem().includes('BEGIN PUBLIC KEY')
}
