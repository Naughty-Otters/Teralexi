import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeRepo } from '@test-paths'

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
  setPackagedRuntimeForTests,
  systemPropKeyToEnvName,
} from './env-overrides'

const KNOWN_KEYS = [
  'app.base.apiUrl',
  'app.metrics.graphqlUrl',
  'app.dev.port',
  'settings.telegram.botToken',
]

const REPO_ROOT = fakeRepo()
const DEV_ENV_PATH = join(REPO_ROOT, 'env', '.dev.env')
const DOT_ENV_PATH = join(REPO_ROOT, 'env', '.env')
const DEV_LOCAL_ENV_PATH = join(REPO_ROOT, 'env', '.dev.local.env')

describe('env-overrides', () => {
  beforeEach(() => {
    resetEnvOverridesForTests()
    vi.mocked(existsSync).mockReset()
    vi.mocked(readFileSync).mockReset()
    electronMock.app.isPackaged = false
    vi.mocked(existsSync).mockReturnValue(false)
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
      resolveBuildTimeEnvFilePaths(REPO_ROOT, { TERALEXI_BUILD_ENV: 'sit' }),
    ).toEqual([join(REPO_ROOT, 'env', '.sit.env')])
    expect(
      resolveBuildTimeEnvFilePaths(REPO_ROOT, { TERALEXI_BUILD_ENV: 'prod' }),
    ).toEqual([join(REPO_ROOT, 'env', '.prod.env')])
    expect(
      resolveBuildTimeEnvFilePaths(REPO_ROOT, { TERALEXI_BUILD_ENV: 'dev' }),
    ).toEqual([DEV_ENV_PATH, DOT_ENV_PATH, DEV_LOCAL_ENV_PATH])
  })

  it('loads dev env file when unpackaged', () => {
    setPackagedRuntimeForTests(false)
    vi.mocked(existsSync).mockImplementation(
      (target) => String(target) === DEV_ENV_PATH,
    )
    vi.mocked(readFileSync).mockImplementation((target) => {
      expect(String(target)).toBe(DEV_ENV_PATH)
      return "BASE_API = 'https://api.teralexi.com/'\n"
    })

    const overrides = loadEnvOverrides({
      knownKeys: ['app.base.apiUrl'],
      searchRoots: [REPO_ROOT],
      // Isolate from ambient BASE_API / other process env that would mask file loads.
      processEnv: { TERALEXI_BUILD_ENV: 'dev' },
    })

    expect(vi.mocked(existsSync)).toHaveBeenCalledWith(DEV_ENV_PATH)
    expect(vi.mocked(readFileSync)).toHaveBeenCalledWith(DEV_ENV_PATH, 'utf-8')
    expect(overrides.get('app.base.apiUrl')).toBe('https://api.teralexi.com/')
  })

  it('merges env/.env over env/.dev.env when present', () => {
    vi.mocked(existsSync).mockImplementation(
      (target) =>
        String(target) === DEV_ENV_PATH || String(target) === DOT_ENV_PATH,
    )
    vi.mocked(readFileSync).mockImplementation((target) => {
      if (String(target) === DOT_ENV_PATH) {
        return "BASE_API = 'http://localhost:8000'\n"
      }
      return "BASE_API = 'https://api.teralexi.com/'\n"
    })

    const overrides = loadEnvOverrides({
      knownKeys: ['app.base.apiUrl'],
      searchRoots: [REPO_ROOT],
      processEnv: { TERALEXI_BUILD_ENV: 'dev' },
    })

    expect(overrides.get('app.base.apiUrl')).toBe('http://localhost:8000')
  })

  it('merges env/.dev.local.env over env/.env when present', () => {
    vi.mocked(existsSync).mockImplementation(
      (target) =>
        String(target) === DEV_ENV_PATH ||
        String(target) === DOT_ENV_PATH ||
        String(target) === DEV_LOCAL_ENV_PATH,
    )
    vi.mocked(readFileSync).mockImplementation((target) => {
      if (String(target) === DEV_LOCAL_ENV_PATH) {
        return "BASE_API = 'http://127.0.0.1:9000'\n"
      }
      if (String(target) === DOT_ENV_PATH) {
        return "BASE_API = 'http://localhost:8000'\n"
      }
      return "BASE_API = 'https://api.teralexi.com/'\n"
    })

    const overrides = loadEnvOverrides({
      knownKeys: ['app.base.apiUrl'],
      searchRoots: [REPO_ROOT],
      processEnv: { TERALEXI_BUILD_ENV: 'dev' },
    })

    expect(overrides.get('app.base.apiUrl')).toBe('http://127.0.0.1:9000')
  })

  it('merges env/.dev.local.env over env/.dev.env when present', () => {
    vi.mocked(existsSync).mockImplementation(
      (target) =>
        String(target) === DEV_ENV_PATH ||
        String(target) === DEV_LOCAL_ENV_PATH,
    )
    vi.mocked(readFileSync).mockImplementation((target) => {
      if (String(target) === DEV_LOCAL_ENV_PATH) {
        return "BASE_API = 'http://localhost:8000'\n"
      }
      return "BASE_API = 'https://api.teralexi.com/'\n"
    })

    const overrides = loadEnvOverrides({
      knownKeys: ['app.base.apiUrl'],
      searchRoots: [REPO_ROOT],
      processEnv: { TERALEXI_BUILD_ENV: 'dev' },
    })

    expect(overrides.get('app.base.apiUrl')).toBe('http://localhost:8000')
  })

  it('uses baked values when packaged', () => {
    setPackagedRuntimeForTests(true)

    const overrides = loadEnvOverrides({
      knownKeys: ['app.base.apiUrl'],
      processEnv: { BASE_API: 'https://staging.example.com/' },
    })

    expect(overrides.get('app.base.apiUrl')).toBe('https://staging.example.com/')
    expect(vi.mocked(existsSync)).not.toHaveBeenCalled()
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
