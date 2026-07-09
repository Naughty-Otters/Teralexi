import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const DEV_PEM =
  '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEACZ1jYBFKh57GVKaLuqDfrJrgQoeqTSWD+RylCVmMKLM=\n-----END PUBLIC KEY-----'

const { getSystemPropValue } = vi.hoisted(() => ({
  getSystemPropValue: vi.fn(),
}))

vi.mock('@config/system-prop', () => ({
  getSystemPropValue,
}))

vi.mock('@config/baked-app-env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@config/baked-app-env')>()
  return {
    ...actual,
    readBakedEntitlementPublicKeyPem: vi.fn(actual.readBakedEntitlementPublicKeyPem),
  }
})

import { readBakedEntitlementPublicKeyPem } from '@config/baked-app-env'
import {
  getEntitlementSigningPublicKeyPem,
  normalizeEntitlementPublicKeyPem,
} from './entitlement-config'
import { importSPKI } from 'jose'

describe('normalizeEntitlementPublicKeyPem', () => {
  it('converts literal \\n escapes', () => {
    const raw =
      '-----BEGIN PUBLIC KEY-----\\nMCowBQYDK2VwAyEACZ1jYBFKh57GVKaLuqDfrJrgQoeqTSWD+RylCVmMKLM=\\n-----END PUBLIC KEY-----'
    expect(normalizeEntitlementPublicKeyPem(raw)).toBe(DEV_PEM)
  })

  it('strips rollup double-quoted baked values', () => {
    const baked = `"${DEV_PEM.replace(/\n/g, '\\n')}"`
    expect(normalizeEntitlementPublicKeyPem(baked)).toBe(DEV_PEM)
  })

  it('imports as Ed25519 SPKI after normalization', async () => {
    const raw =
      '"-----BEGIN PUBLIC KEY-----\\nMCowBQYDK2VwAyEACZ1jYBFKh57GVKaLuqDfrJrgQoeqTSWD+RylCVmMKLM=\\n-----END PUBLIC KEY-----"'
    const pem = normalizeEntitlementPublicKeyPem(raw)
    await expect(importSPKI(pem, 'EdDSA')).resolves.toBeDefined()
  })
})

describe('getEntitlementSigningPublicKeyPem', () => {
  beforeEach(() => {
    vi.mocked(getSystemPropValue).mockReturnValue('')
    vi.mocked(readBakedEntitlementPublicKeyPem).mockReturnValue('')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('prefers env override over baked value', () => {
    getSystemPropValue.mockReturnValue(DEV_PEM)
    vi.mocked(readBakedEntitlementPublicKeyPem).mockReturnValue('baked-pem')

    expect(getEntitlementSigningPublicKeyPem()).toBe(DEV_PEM)
    expect(readBakedEntitlementPublicKeyPem).not.toHaveBeenCalled()
  })

  it('falls back to baked reader when env override is empty', () => {
    vi.mocked(readBakedEntitlementPublicKeyPem).mockReturnValue(DEV_PEM)

    expect(getEntitlementSigningPublicKeyPem()).toBe(DEV_PEM)
    expect(readBakedEntitlementPublicKeyPem).toHaveBeenCalledWith(process.env)
  })
})
