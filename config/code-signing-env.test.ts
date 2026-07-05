import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeRepo, pathEndsWith } from '@test-paths'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

import { existsSync, readFileSync } from 'node:fs'
import {
  applyCodeSigningEnv,
  buildAzureTrustedSigningExtraArgs,
  buildElectronBuilderExtraArgs,
  describeCodeSigningEnv,
  formatAzureTrustedSigningValidationBanner,
  inspectAzureTrustedSigningEnv,
  isAzureTrustedSigningConfigured,
  isInlineCertificate,
  isMacCodeSigningConfigured,
  isMacNotarizeConfigured,
  isWindowsCodeSigningConfigured,
  loadCodeSigningEnv,
  logCodeSigningEnv,
  normalizeMacSignIdentity,
  parseCodeSigningEnvFile,
  resolveCodeSigningEnvFilePaths,
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
    delete process.env.AZURE_TENANT_ID
    delete process.env.AZURE_CLIENT_ID
    delete process.env.AZURE_CLIENT_SECRET
    delete process.env.AZURE_SIGNING_ENDPOINT
    delete process.env.AZURE_SIGNING_ACCOUNT_NAME
    delete process.env.AZURE_SIGNING_CERTIFICATE_PROFILE
    delete process.env.AZURE_SIGNING_PUBLISHER_NAME
  })

  it('normalizeMacSignIdentity strips Keychain prefix for electron-builder', () => {
    expect(
      normalizeMacSignIdentity(
        'Developer ID Application: zhenqi li (X5L2P5D43H)',
      ),
    ).toBe('zhenqi li (X5L2P5D43H)')
    expect(normalizeMacSignIdentity('zhenqi li (X5L2P5D43H)')).toBe(
      'zhenqi li (X5L2P5D43H)',
    )
  })

  it('applyCodeSigningEnv normalizes CSC_NAME and prefers keychain over local .p12', () => {
    const env = {
      ...process.env,
      MAC_SIGN_IDENTITY: 'Developer ID Application: Example (TEAM123)',
      MAC_SIGN_CERTIFICATE: '~/certs/openfde.p12',
      MAC_SIGN_CERTIFICATE_PASSWORD: 'mac-secret',
    } as NodeJS.ProcessEnv

    applyCodeSigningEnv(env)
    expect(env.CSC_NAME).toBe('Example (TEAM123)')
    expect(env.CSC_LINK).toBeUndefined()
    expect(env.CSC_KEY_PASSWORD).toBeUndefined()
    expect(env.CSC_IDENTITY_AUTO_DISCOVERY).toBe('false')
  })

  it('applyCodeSigningEnv keeps base64 CSC_LINK for CI when identity is set', () => {
    const env = {
      ...process.env,
      CSC_NAME: 'Developer ID Application: Example (TEAM123)',
      CSC_LINK: 'data:application/x-pkcs12;base64,AAAA',
      CSC_KEY_PASSWORD: 'mac-secret',
    } as NodeJS.ProcessEnv

    applyCodeSigningEnv(env)
    expect(env.CSC_NAME).toBe('Example (TEAM123)')
    expect(env.CSC_LINK).toBe('data:application/x-pkcs12;base64,AAAA')
    expect(env.CSC_KEY_PASSWORD).toBe('mac-secret')
  })

  it('applyCodeSigningEnv keeps RAW base64 CSC_LINK (MAC_SIGN_CERTIFICATE_BASE64) when identity is set', () => {
    // CI passes a Developer ID identity AND the raw (non-data:) base64 .p12.
    const rawBase64 = `${'A'.repeat(3000)}=`
    const env = {
      ...process.env,
      MAC_SIGN_IDENTITY: 'Developer ID Application: Example (TEAM123)',
      MAC_SIGN_CERTIFICATE: rawBase64,
      MAC_SIGN_CERTIFICATE_PASSWORD: 'mac-secret',
    } as NodeJS.ProcessEnv

    applyCodeSigningEnv(env)
    expect(env.CSC_NAME).toBe('Example (TEAM123)')
    expect(env.CSC_LINK).toBe(rawBase64)
    expect(env.CSC_KEY_PASSWORD).toBe('mac-secret')
  })

  it('isInlineCertificate distinguishes inline certs from local paths', () => {
    expect(isInlineCertificate('data:application/x-pkcs12;base64,AAAA')).toBe(true)
    expect(isInlineCertificate(`${'A'.repeat(3000)}`)).toBe(true)
    expect(isInlineCertificate('QUFBQQ==')).toBe(true)
    expect(isInlineCertificate('~/certs/openfde.p12')).toBe(false)
    expect(isInlineCertificate('/abs/path/openfde.p12')).toBe(false)
    expect(isInlineCertificate('')).toBe(false)
  })

  it('resolveCodeSigningEnvFilePaths points at gitignored env/.signing.env', () => {
    expect(resolveCodeSigningEnvFilePaths(fakeRepo())).toEqual([
      join(fakeRepo(), 'env', '.signing.env'),
    ])
  })

  it('loads signing vars from env/.signing.env', () => {
    vi.mocked(existsSync).mockImplementation((target) =>
      pathEndsWith(String(target), 'env/.signing.env'),
    )
    vi.mocked(readFileSync).mockReturnValue(
      "MAC_SIGN_IDENTITY = 'Example (TEAM123)'\n",
    )

    const env = loadCodeSigningEnv()
    expect(env.get('CSC_NAME')).toBe('Example (TEAM123)')
  })

  it('prefers process env over env/.signing.env', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      "MAC_SIGN_IDENTITY = 'From File'\n",
    )
    process.env.MAC_SIGN_IDENTITY = 'From Shell'

    const env = loadCodeSigningEnv()
    expect(env.get('CSC_NAME')).toBe('From Shell')
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

  it('prefers process env over env/.signing.env on disk', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      "MAC_SIGN_IDENTITY = 'Developer ID Application: From File'\n",
    )
    process.env.MAC_SIGN_IDENTITY = 'Developer ID Application: From Shell'

    const env = loadCodeSigningEnv()
    expect(env.get('CSC_NAME')).toBe('Developer ID Application: From Shell')
  })

  it('inspectAzureTrustedSigningEnv reports each missing field', () => {
    const report = inspectAzureTrustedSigningEnv({
      AZURE_TENANT_ID: '11111111-1111-1111-1111-111111111111',
      AZURE_CLIENT_ID: '22222222-2222-2222-2222-222222222222',
    })

    expect(report.anyPresent).toBe(true)
    expect(report.configured).toBe(false)
    expect(report.missingKeys).toEqual([
      'AZURE_CLIENT_SECRET',
      'AZURE_SIGNING_ENDPOINT',
      'AZURE_SIGNING_ACCOUNT_NAME',
      'AZURE_SIGNING_CERTIFICATE_PROFILE',
      'AZURE_SIGNING_PUBLISHER_NAME',
    ])

    const banner = formatAzureTrustedSigningValidationBanner(report)
    expect(banner).toContain('configuration incomplete')
    expect(banner).toContain('MISSING  AZURE_CLIENT_SECRET')
    expect(report.fields.find((f) => f.key === 'AZURE_TENANT_ID')?.present).toBe(
      true,
    )
    expect(banner).toContain('AZURE_TENANT_ID')
  })

  it('inspectAzureTrustedSigningEnv flags invalid endpoint and GUID formats', () => {
    const report = inspectAzureTrustedSigningEnv({
      AZURE_TENANT_ID: 'not-a-guid',
      AZURE_CLIENT_ID: '22222222-2222-2222-2222-222222222222',
      AZURE_CLIENT_SECRET: 'secret',
      AZURE_SIGNING_ENDPOINT: 'https://example.com/',
      AZURE_SIGNING_ACCOUNT_NAME: 'openfde',
      AZURE_SIGNING_CERTIFICATE_PROFILE: 'openfde-profile',
      AZURE_SIGNING_PUBLISHER_NAME: 'Example Dev',
    })

    expect(report.configured).toBe(false)
    expect(report.formatWarnings.some((w) => w.includes('AZURE_TENANT_ID'))).toBe(
      true,
    )
    expect(report.formatWarnings.some((w) => w.includes('AZURE_SIGNING_ENDPOINT'))).toBe(
      true,
    )
  })

  it('formatAzureTrustedSigningValidationBanner lists all fields when configured', () => {
    const report = inspectAzureTrustedSigningEnv({
      AZURE_TENANT_ID: '11111111-1111-1111-1111-111111111111',
      AZURE_CLIENT_ID: '22222222-2222-2222-2222-222222222222',
      AZURE_CLIENT_SECRET: 'secret',
      AZURE_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net/',
      AZURE_SIGNING_ACCOUNT_NAME: 'openfde',
      AZURE_SIGNING_CERTIFICATE_PROFILE: 'openfde-profile',
      AZURE_SIGNING_PUBLISHER_NAME: 'Example Dev',
    })

    expect(report.configured).toBe(true)
    const banner = formatAzureTrustedSigningValidationBanner(report)
    expect(banner).toContain('all required variables are present')
    expect(banner).toContain('AZURE_SIGNING_PUBLISHER_NAME')
  })

  it('detects Azure Trusted Signing configuration', () => {
    expect(isAzureTrustedSigningConfigured({})).toBe(false)
    expect(
      isAzureTrustedSigningConfigured({
        AZURE_TENANT_ID: '11111111-1111-1111-1111-111111111111',
        AZURE_CLIENT_ID: '22222222-2222-2222-2222-222222222222',
        AZURE_CLIENT_SECRET: 'secret',
        AZURE_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net/',
        AZURE_SIGNING_ACCOUNT_NAME: 'openfde',
        AZURE_SIGNING_CERTIFICATE_PROFILE: 'openfde-profile',
        AZURE_SIGNING_PUBLISHER_NAME: 'Example Dev',
      }),
    ).toBe(true)
    expect(
      isWindowsCodeSigningConfigured(
        new Map(),
        {
          AZURE_TENANT_ID: '11111111-1111-1111-1111-111111111111',
          AZURE_CLIENT_ID: '22222222-2222-2222-2222-222222222222',
          AZURE_CLIENT_SECRET: 'secret',
          AZURE_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net/',
          AZURE_SIGNING_ACCOUNT_NAME: 'openfde',
          AZURE_SIGNING_CERTIFICATE_PROFILE: 'openfde-profile',
          AZURE_SIGNING_PUBLISHER_NAME: 'Example Dev',
        },
      ),
    ).toBe(true)
  })

  it('buildAzureTrustedSigningExtraArgs injects win.azureSignOptions for electron-builder', () => {
    const env = {
      AZURE_TENANT_ID: '11111111-1111-1111-1111-111111111111',
      AZURE_CLIENT_ID: '22222222-2222-2222-2222-222222222222',
      AZURE_CLIENT_SECRET: 'secret',
      AZURE_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net/',
      AZURE_SIGNING_ACCOUNT_NAME: 'openfde',
      AZURE_SIGNING_CERTIFICATE_PROFILE: 'openfde-profile',
      AZURE_SIGNING_PUBLISHER_NAME: 'Example Dev',
    } as NodeJS.ProcessEnv

    expect(buildAzureTrustedSigningExtraArgs(env)).toEqual([
      '--config.win.azureSignOptions.publisherName=Example Dev',
      '--config.win.azureSignOptions.endpoint=https://eus.codesigning.azure.net/',
      '--config.win.azureSignOptions.certificateProfileName=openfde-profile',
      '--config.win.azureSignOptions.codeSigningAccountName=openfde',
    ])

    expect(
      buildElectronBuilderExtraArgs(new Map(), { buildingWin: true }, env),
    ).toEqual(buildAzureTrustedSigningExtraArgs(env))
  })

  it('applyCodeSigningEnv loads Azure vars from env/.signing.env', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(`
AZURE_TENANT_ID = 'tenant-from-file'
AZURE_CLIENT_ID = 'client-from-file'
AZURE_CLIENT_SECRET = 'secret-from-file'
AZURE_SIGNING_ENDPOINT = 'https://eus.codesigning.azure.net/'
AZURE_SIGNING_ACCOUNT_NAME = 'openfde'
AZURE_SIGNING_CERTIFICATE_PROFILE = 'openfde-profile'
AZURE_SIGNING_PUBLISHER_NAME = 'Example Dev'
`)

    const env = { ...process.env } as NodeJS.ProcessEnv
    applyCodeSigningEnv(env)
    expect(env.AZURE_TENANT_ID).toBe('tenant-from-file')
    expect(env.AZURE_CLIENT_ID).toBe('client-from-file')
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
      expect(env.CSC_NAME).toBe('Example (TEAM123)')
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
  })

  it('forces code signing for signed macOS builds (fail loudly instead of ad-hoc)', () => {
    expect(
      buildElectronBuilderExtraArgs(
        new Map([['CSC_NAME', 'Developer ID Application: Example']]),
        { buildingMac: true },
      ),
    ).toEqual(['--config.mac.forceCodeSigning=true'])
  })

  it('keeps identity auto-discovery enabled for inline (CI base64) certs', () => {
    const env = {
      ...process.env,
      MAC_SIGN_IDENTITY: 'Developer ID Application: Example (TEAM123)',
      MAC_SIGN_CERTIFICATE: `${'A'.repeat(3000)}=`,
      MAC_SIGN_CERTIFICATE_PASSWORD: 'mac-secret',
    } as NodeJS.ProcessEnv
    delete env.CSC_IDENTITY_AUTO_DISCOVERY

    applyCodeSigningEnv(env)
    // Inline cert imported into a temp keychain — leave auto-discovery on so the
    // identity resolves even if CSC_NAME doesn't match exactly.
    expect(env.CSC_IDENTITY_AUTO_DISCOVERY).toBeUndefined()
    expect(env.CSC_LINK).toContain('AAAA')
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

  const messages = (d: { message: string }[]) => d.map((x) => x.message)

  it('describeCodeSigningEnv reports missing macOS + notarization vars as warnings', () => {
    const diagnostics = describeCodeSigningEnv(new Map(), { buildingMac: true })
    const warnings = diagnostics.filter((d) => d.level === 'warn')

    expect(messages(diagnostics)).toContain('  MAC_SIGN_IDENTITY (CSC_NAME): MISSING')
    expect(messages(warnings).join('\n')).toContain('macOS signing NOT configured')
    expect(messages(warnings).join('\n')).toContain('Notarization DISABLED')
  })

  it('describeCodeSigningEnv marks present vars as info', () => {
    const env = new Map([
      ['CSC_NAME', 'Example (TEAM123)'],
      ['APPLE_ID', 'dev@example.com'],
      ['APPLE_APP_SPECIFIC_PASSWORD', 'abcd'],
      ['APPLE_TEAM_ID', 'TEAM123'],
    ])
    const diagnostics = describeCodeSigningEnv(env, { buildingMac: true })
    expect(diagnostics.some((d) => d.message.includes('MAC_SIGN_IDENTITY (CSC_NAME): present'))).toBe(true)
    expect(diagnostics.every((d) => d.level === 'info')).toBe(true)
  })

  it('describeCodeSigningEnv warns on partial notarization credentials', () => {
    const env = new Map([
      ['CSC_NAME', 'Example (TEAM123)'],
      ['APPLE_ID', 'dev@example.com'],
    ])
    const warnings = describeCodeSigningEnv(env, { buildingMac: true }).filter(
      (d) => d.level === 'warn',
    )
    const text = messages(warnings).join('\n')
    expect(text).toContain('Notarization PARTIALLY configured')
    expect(text).toContain('MAC_APPLE_APP_SPECIFIC_PASSWORD')
    expect(text).toContain('MAC_APPLE_TEAM_ID')
  })

  it('describeCodeSigningEnv warns when Windows cert is missing', () => {
    const warnings = describeCodeSigningEnv(new Map(), { buildingWin: true }).filter(
      (d) => d.level === 'warn',
    )
    expect(messages(warnings).join('\n')).toContain('Windows signing NOT configured')
    expect(messages(warnings).join('\n')).toContain('Azure Trusted Signing')
  })

  it('describeCodeSigningEnv warns when .p12 password is missing', () => {
    const env = new Map([
      ['CSC_NAME', 'Example (TEAM123)'],
      ['CSC_LINK', '/certs/openfde.p12'],
    ])
    const text = messages(
      describeCodeSigningEnv(env, { buildingMac: true }).filter(
        (d) => d.level === 'warn',
      ),
    ).join('\n')
    expect(text).toContain('MAC_SIGN_CERTIFICATE_PASSWORD is MISSING')
  })

  it('logCodeSigningEnv routes warnings and info to the correct logger channel', () => {
    const info: string[] = []
    const warn: string[] = []
    logCodeSigningEnv(new Map(), { buildingWin: true }, {
      info: (m) => info.push(m),
      warn: (m) => warn.push(m),
    })
    expect(info.some((m) => m.startsWith('[code-sign] '))).toBe(true)
    expect(warn.some((m) => m.includes('Windows signing NOT configured'))).toBe(true)
  })
})
