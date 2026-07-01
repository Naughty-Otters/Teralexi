import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

const electronMock = vi.hoisted(() => ({
  app: { isPackaged: false as boolean },
}))

vi.mock('electron', () => electronMock)

import { existsSync, readFileSync } from 'node:fs'
import { loadBakedEnvOverrides } from './baked-app-env'
import {
  envNameToSystemPropKey,
  loadEnvOverrides,
  parseEnvFile,
  resetEnvOverridesForTests,
  resolveBuildTimeEnvFilePaths,
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
    electronMock.app.isPackaged = false
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
  })

  it('parses quoted env values and dotted keys', () => {
    const parsed = parseEnvFile(
      `
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

  it('maps BASE_API env var to app.base.apiUrl', () => {
    const parsed = parseEnvFile(
      "BASE_API = 'http://127.0.0.1:8000'\n",
      KNOWN_KEYS,
    )
    expect(parsed.get('app.base.apiUrl')).toBe('http://127.0.0.1:8000')
  })

  it('resolveBuildTimeEnvFilePaths uses only repo env files', () => {
    expect(
      resolveBuildTimeEnvFilePaths('/repo', { OPENFDE_BUILD_ENV: 'sit' }),
    ).toEqual(['/repo/env/.sit.env'])
    expect(
      resolveBuildTimeEnvFilePaths('/repo', { OPENFDE_BUILD_ENV: 'prod' }),
    ).toEqual(['/repo/env/.prod.env'])
  })

  it('loads dev env file when unpackaged', () => {
    vi.mocked(existsSync).mockImplementation((target) =>
      String(target).endsWith('/env/.dev.env'),
    )
    vi.mocked(readFileSync).mockReturnValue(
      "BASE_API = 'http://127.0.0.1:8000'\n",
    )

    const overrides = loadEnvOverrides({
      knownKeys: ['app.base.apiUrl'],
      searchRoots: ['/Users/tester/code/OpenFDE'],
      processEnv: { OPENFDE_BUILD_ENV: 'dev' },
    })

    expect(overrides.get('app.base.apiUrl')).toBe('http://127.0.0.1:8000')
  })

  it('uses baked values when packaged', () => {
    electronMock.app.isPackaged = true

    const overrides = loadEnvOverrides({
      knownKeys: ['app.base.apiUrl'],
      processEnv: { BASE_API: 'https://staging.example.com/' },
    })

    expect(overrides.get('app.base.apiUrl')).toBe('https://staging.example.com/')
    electronMock.app.isPackaged = false
  })
})

describe('baked-app-env', () => {
  it('loadBakedEnvOverrides reads process env when placeholders are unset', () => {
    const overrides = loadBakedEnvOverrides(['app.base.apiUrl'], {
      BASE_API: 'https://staging.example.com/',
    } as NodeJS.ProcessEnv)
    expect(overrides.get('app.base.apiUrl')).toBe('https://staging.example.com/')
  })
})
