import { importSPKI, jwtVerify, type JWTPayload } from 'jose'
import { ENTITLEMENT_AUDIENCE } from '@shared/subscription/entitlement-types'
import { expectedIssuerFor } from '@shared/subscription/entitlement-issuer'
import type { VerifiedEntitlementClaims } from '@shared/subscription/entitlement-types'
import { getEntitlementSigningPublicKeyPem } from './entitlement-config'

const CLOCK_TOLERANCE_SEC = 60

let cachedPublicKey: CryptoKey | null | undefined

async function loadVerificationKey(): Promise<CryptoKey> {
  if (cachedPublicKey) return cachedPublicKey
  const pem = getEntitlementSigningPublicKeyPem()
  if (!pem.includes('BEGIN PUBLIC KEY')) {
    throw new Error('Entitlement signing public key is not configured')
  }
  cachedPublicKey = await importSPKI(pem, 'EdDSA')
  return cachedPublicKey
}

export function resetEntitlementVerifierForTests(): void {
  cachedPublicKey = undefined
}

function readStringClaim(payload: JWTPayload, key: string): string {
  const value = payload[key]
  return typeof value === 'string' ? value : String(value ?? '')
}

function readStringArrayClaim(payload: JWTPayload, key: string): string[] {
  const value = payload[key]
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item))
}

function readLimitsClaim(payload: JWTPayload): Record<string, unknown> {
  const value = payload.limits
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export async function verifyEntitlementToken(args: {
  entitlementToken: string
  apiBaseUrl: string
  teralexiUserId?: string
  requestId?: string
}): Promise<VerifiedEntitlementClaims> {
  const issuer = expectedIssuerFor(args.apiBaseUrl)
  const publicKey = await loadVerificationKey()
  const { payload } = await jwtVerify(args.entitlementToken, publicKey, {
    issuer,
    audience: ENTITLEMENT_AUDIENCE,
    algorithms: ['EdDSA'],
    clockTolerance: CLOCK_TOLERANCE_SEC,
  })

  const teralexiUserId = readStringClaim(payload, 'sub')
  if (
    args.teralexiUserId &&
    teralexiUserId &&
    teralexiUserId !== args.teralexiUserId
  ) {
    throw new Error('Entitlement user mismatch')
  }

  if (args.requestId) {
    const nonce = payload.nonce
    if (typeof nonce !== 'string' || nonce !== args.requestId) {
      throw new Error('Entitlement nonce mismatch')
    }
  }

  const exp = payload.exp
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    throw new Error('Entitlement token missing exp')
  }

  return {
    plan: readStringClaim(payload, 'plan'),
    planName: readStringClaim(payload, 'plan_name'),
    status: readStringClaim(payload, 'status'),
    features: readStringArrayClaim(payload, 'features'),
    limits: readLimitsClaim(payload),
    revision: Number(payload.revision ?? 0),
    teralexiUserId,
    expiresAt: new Date(exp * 1000),
  }
}
