import { generateKeyPair, SignJWT } from 'jose'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ENTITLEMENT_AUDIENCE } from '@shared/subscription/entitlement-types'

const { getEntitlementSigningPublicKeyPem } = vi.hoisted(() => ({
  getEntitlementSigningPublicKeyPem: vi.fn(),
}))

vi.mock('./entitlement-config', () => ({
  getEntitlementSigningPublicKeyPem,
}))

import {
  resetEntitlementVerifierForTests,
  verifyEntitlementToken,
} from './entitlement-verifier'

let publicPem = ''
let privateKey: CryptoKey

async function signTestToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuer('http://localhost:8000')
    .setAudience(ENTITLEMENT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(privateKey)
}

describe('verifyEntitlementToken', () => {
  beforeEach(async () => {
    resetEntitlementVerifierForTests()
    const pair = await generateKeyPair('EdDSA')
    privateKey = pair.privateKey
    publicPem = await import('jose').then(({ exportSPKI }) =>
      exportSPKI(pair.publicKey),
    )
    getEntitlementSigningPublicKeyPem.mockReturnValue(publicPem)
  })

  it('verifies a valid entitlement token', async () => {
    const token = await signTestToken({
      sub: '42',
      plan: 'base',
      plan_name: 'Base',
      status: 'active',
      features: ['metrics.write', 'support.upload'],
      limits: {},
      revision: 1,
      nonce: 'req-1',
    })

    const claims = await verifyEntitlementToken({
      entitlementToken: token,
      apiBaseUrl: 'http://localhost:8000',
      teralexiUserId: '42',
      requestId: 'req-1',
    })

    expect(claims.plan).toBe('base')
    expect(claims.features).toEqual(['metrics.write', 'support.upload'])
    expect(claims.teralexiUserId).toBe('42')
  })

  it('rejects user mismatch', async () => {
    const token = await signTestToken({
      sub: '99',
      plan: 'base',
      plan_name: 'Base',
      status: 'active',
      features: [],
      limits: {},
      revision: 1,
    })

    await expect(
      verifyEntitlementToken({
        entitlementToken: token,
        apiBaseUrl: 'http://localhost:8000',
        teralexiUserId: '42',
      }),
    ).rejects.toThrow(/user mismatch/i)
  })

  it('rejects nonce mismatch', async () => {
    const token = await signTestToken({
      sub: '42',
      plan: 'base',
      plan_name: 'Base',
      status: 'active',
      features: [],
      limits: {},
      revision: 1,
      nonce: 'other',
    })

    await expect(
      verifyEntitlementToken({
        entitlementToken: token,
        apiBaseUrl: 'http://localhost:8000',
        teralexiUserId: '42',
        requestId: 'req-1',
      }),
    ).rejects.toThrow(/nonce mismatch/i)
  })
})
