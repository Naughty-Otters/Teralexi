import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('./env-overrides', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./env-overrides')>()
  return {
    ...actual,
    resolveBuildTimeEnvFilePaths: vi.fn(() => ['/app/env/.prod.env']),
  }
})

import { existsSync, readFileSync } from 'node:fs'
import {
  applyCodeSigningEnv,
  buildElectronBuilderExtraArgs,
  isMacCodeSigningConfigured,
  isMacNotarizeConfigured,
  isWindowsCodeSigningConfigured,
  loadCodeSigningEnv,
  parseCodeSigningEnvFile,
} from './code-signing-env'

describe('code-signing-env', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset()
    vi.mocked(readFileSync).mockReset()
    delete process.env.CSC_NAME
    delete process.env.CSC_LINK
    delete process.env.WIN_CSC_LINK
    delete process.env.WIN_CSC_KEY_PASSWORD
    delete process.env.APPLE_ID
    delete process.env.APPLE_APP_SPECIFIC_PASSWORD
    delete process.env.APPLE_TEAM_ID
    delete process.env.MAC_SIGN_IDENTITY
    delete process.env.WIN_SIGN_CERTIFICATE
  })

  it('maps friendly MAC_SIGN_* and WIN_SIGN_* aliases from env files', () => {
    const parsed = parseCodeSigningEnvFile(`
MAC_SIGN_IDENTITY = 'Developer ID Application: Example (TEAM123)'
MAC_SIGN_CERTIFICATE = '~/certs/openfde.p12'
MAC_SIGN_CERTIFICATE_PASSWORD = 'mac-secret'
MAC_APPLE_ID = 'dev@example.com'
MAC_APPLE_APP_SPECIFIC_PASSWORD = 'abcd-efgh'
MAC_APPLE_TEAM_ID = 'TEAM123'
WIN_SIGN_CERTIFICATE = '~/certs/openfde.pfx'
WIN_SIGN_CERTIFICATE_PASSWORD = 'win-secret'
`)
    expect(parsed.get('CSC_NAME')).toBe(
      'Developer ID Application: Example (TEAM123)',
    )
    expect(parsed.get('CSC_LINK')).toBe('~/certs/openfde.p12')
    expect(parsed.get('CSC_KEY_PASSWORD')).toBe('mac-secret')
    expect(parsed.get('WIN_CSC_LINK')).toBe('~/certs/openfde.pfx')
    expect(parsed.get('WIN_CSC_KEY_PASSWORD')).toBe('win-secret')
    expect(parsed.get('APPLE_ID')).toBe('dev@example.com')
  })

  it('prefers process env over env files', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      "MAC_SIGN_IDENTITY = 'Developer ID Application: From File'\n",
    )
    process.env.MAC_SIGN_IDENTITY = 'Developer ID Application: From Shell'

    const env = loadCodeSigningEnv()
    expect(env.get('CSC_NAME')).toBe('Developer ID Application: From Shell')
  })

  it('detects signing and notarization configuration', () => {
    expect(isMacCodeSigningConfigured(new Map())).toBe(false)
    expect(isWindowsCodeSigningConfigured(new Map())).toBe(false)
    expect(
      isMacCodeSigningConfigured(
        new Map([['CSC_NAME', 'Developer ID Application: Example']]),
      ),
    ).toBe(true)
    expect(
      isWindowsCodeSigningConfigured(
        new Map([['WIN_CSC_LINK', 'C:\\certs\\openfde.pfx']]),
      ),
    ).toBe(true)
    expect(
      isMacNotarizeConfigured(
        new Map([
          ['APPLE_ID', 'dev@example.com'],
          ['APPLE_APP_SPECIFIC_PASSWORD', 'abcd'],
          ['APPLE_TEAM_ID', 'TEAM123'],
        ]),
      ),
    ).toBe(true)
  })

  it('applyCodeSigningEnv expands paths and maps WIN cert to CSC_LINK on Windows', () => {
    const env = {
      ...process.env,
      MAC_SIGN_IDENTITY: 'Developer ID Application: Example (TEAM123)',
      MAC_SIGN_CERTIFICATE: '~/certs/openfde.p12',
      WIN_SIGN_CERTIFICATE: '~/certs/openfde.pfx',
      WIN_SIGN_CERTIFICATE_PASSWORD: 'win-secret',
    } as NodeJS.ProcessEnv

    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })

    try {
      applyCodeSigningEnv(env)
      expect(env.CSC_NAME).toBe('Developer ID Application: Example (TEAM123)')
      expect(env.CSC_LINK).toContain('openfde.pfx')
      expect(env.CSC_KEY_PASSWORD).toBe('win-secret')
      expect(env.WIN_CSC_LINK).toContain('openfde.pfx')
      expect(env.CSC_IDENTITY_AUTO_DISCOVERY).toBe('false')
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }
  })

  it('adds notarize flag when Apple credentials are configured', () => {
    const args = buildElectronBuilderExtraArgs(
      new Map([
        ['APPLE_ID', 'dev@example.com'],
        ['APPLE_APP_SPECIFIC_PASSWORD', 'abcd'],
        ['APPLE_TEAM_ID', 'TEAM123'],
      ]),
    )
    expect(args).toEqual(['--config.mac.notarize=true'])
  })

  it('disables hardenedRuntime for unsigned macOS builds', () => {
    expect(
      buildElectronBuilderExtraArgs(new Map(), { buildingMac: true }),
    ).toEqual(['--config.mac.hardenedRuntime=false'])
    expect(
      buildElectronBuilderExtraArgs(
        new Map([['CSC_NAME', 'Developer ID Application: Example']]),
        { buildingMac: true },
      ),
    ).toEqual([])
  })

  it('disables Windows signing for unsigned Windows builds', () => {
    expect(
      buildElectronBuilderExtraArgs(new Map(), { buildingWin: true }),
    ).toEqual(['--config.win.signAndEditExecutable=false'])
    expect(
      buildElectronBuilderExtraArgs(
        new Map([['WIN_CSC_LINK', 'C:\\certs\\openfde.pfx']]),
        { buildingWin: true },
      ),
    ).toEqual([])
  })

  it('applyUnsignedPlatformBuildPolicy disables auto-discovery for unsigned targets', async () => {
    const { applyUnsignedPlatformBuildPolicy } = await import('./code-signing-env')
    const env = {} as NodeJS.ProcessEnv
    applyUnsignedPlatformBuildPolicy(env, new Map(), {
      buildingMac: true,
      buildingWin: true,
    })
    expect(env.CSC_IDENTITY_AUTO_DISCOVERY).toBe('false')
  })
})
