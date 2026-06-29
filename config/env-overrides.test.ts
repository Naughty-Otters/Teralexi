import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: vi.fn(() => '/Users/tester'),
  }
})

import { existsSync, readFileSync } from 'node:fs'
import {
  envNameToSystemPropKey,
  loadEnvOverrides,
  parseEnvFile,
  resetEnvOverridesForTests,
  stripEnvValue,
  systemPropKeyToEnvName,
} from './env-overrides'

const KNOWN_KEYS = [
  'app.base.apiUrl',
  'app.metrics.graphqlUrl',
  'app.dev.port',
  'settings.telegram.botToken',
]

describe('env-overrides', () => {
  beforeEach(() => {
    resetEnvOverridesForTests()
    vi.mocked(existsSync).mockReset()
    vi.mocked(readFileSync).mockReset()
  })

  it('maps system prop keys to env var names', () => {
    expect(systemPropKeyToEnvName('app.metrics.graphqlUrl')).toBe(
      'APP_METRICS_GRAPHQLURL',
    )
  })

  it('maps env var names back to system prop keys', () => {
    expect(envNameToSystemPropKey('APP_METRICS_GRAPHQLURL', KNOWN_KEYS)).toBe(
      'app.metrics.graphqlUrl',
    )
    expect(
      envNameToSystemPropKey('OPENFDE_APP_METRICS_GRAPHQLURL', KNOWN_KEYS),
    ).toBe('app.metrics.graphqlUrl')
    expect(
      envNameToSystemPropKey('app.metrics.graphqlUrl', KNOWN_KEYS),
    ).toBe('app.metrics.graphqlUrl')
  })

  it('parses quoted env values and dotted keys', () => {
    const parsed = parseEnvFile(
      `
# comment
app.metrics.graphqlUrl = 'http://127.0.0.1:8000/graphql'
APP_DEV_PORT=3000
`,
      KNOWN_KEYS,
    )

    expect(parsed.get('app.metrics.graphqlUrl')).toBe(
      'http://127.0.0.1:8000/graphql',
    )
    expect(parsed.get('app.dev.port')).toBe('3000')
  })

  it('strips surrounding quotes', () => {
    expect(stripEnvValue("'value'")).toBe('value')
    expect(stripEnvValue('"value"')).toBe('value')
  })

  it('maps BASE_API env var to app.base.apiUrl', () => {
    const parsed = parseEnvFile(
      "BASE_API = 'http://127.0.0.1:8000'\n",
      KNOWN_KEYS,
    )
    expect(parsed.get('app.base.apiUrl')).toBe('http://127.0.0.1:8000')
  })

  it('maps DESKTOP_UPDATE_FORCE_DEV env var to app.desktop.forceDevUpdateConfig', () => {
    const parsed = parseEnvFile(
      "DESKTOP_UPDATE_FORCE_DEV = 'true'\n",
      ['app.desktop.forceDevUpdateConfig'],
    )
    expect(parsed.get('app.desktop.forceDevUpdateConfig')).toBe('true')
  })

  it('loads overrides from env files and process env', () => {
    vi.mocked(existsSync).mockImplementation((target) =>
      String(target).endsWith('/env/.prod.env'),
    )
    vi.mocked(readFileSync).mockReturnValue(
      "app.metrics.graphqlUrl = 'http://metrics.example/graphql'\n",
    )

    const overrides = loadEnvOverrides({
      knownKeys: KNOWN_KEYS,
      searchRoots: ['/app'],
      processEnv: {
        NODE_ENV: 'production',
        APP_DEV_PORT: '4000',
      },
    })

    expect(overrides.get('app.metrics.graphqlUrl')).toBe(
      'http://metrics.example/graphql',
    )
    expect(overrides.get('app.dev.port')).toBe('4000')
  })

  it('loads staging overrides from .sit.env when OPENFDE_BUILD_ENV is sit', () => {
    vi.mocked(existsSync).mockImplementation((target) =>
      String(target).endsWith('/env/.sit.env'),
    )
    vi.mocked(readFileSync).mockReturnValue(
      "app.metrics.graphqlUrl = 'http://staging.example/graphql'\n",
    )

    const overrides = loadEnvOverrides({
      knownKeys: KNOWN_KEYS,
      searchRoots: ['/app'],
      processEnv: {
        OPENFDE_BUILD_ENV: 'sit',
        NODE_ENV: 'production',
      },
    })

    expect(overrides.get('app.metrics.graphqlUrl')).toBe(
      'http://staging.example/graphql',
    )
  })
})
