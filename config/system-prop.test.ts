import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('@config/openfde-home', () => ({
  getopenfdeConfigDir: vi.fn(() => '/mock/.openfde/config'),
  getopenfdeConfigPropertiesPath: vi.fn(() => '/mock/.openfde/config/config.properties'),
}))

vi.mock('./env-overrides', () => ({
  initializeEnvOverrides: vi.fn(),
  getEnvOverrides: vi.fn(() => new Map<string, string>()),
}))

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { getEnvOverrides } from './env-overrides'
import {
  CONFIG_PROPERTIES_FILENAME,
  ensureSystemPropFile,
  getSystemPropFilePath,
  getSystemPropValue,
  getSystemPropValues,
  isValidSystemPropKey,
  setSystemPropValue,
} from './system-prop'

describe('system-prop', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset()
    vi.mocked(readFileSync).mockReset()
    vi.mocked(writeFileSync).mockReset()
  })

  it('exports config filename constants', () => {
    expect(CONFIG_PROPERTIES_FILENAME).toBe('config.properties')
  })

  it('validates dotted config keys', () => {
    expect(isValidSystemPropKey('app.dev.port')).toBe(true)
    expect(isValidSystemPropKey('app.google.clientId')).toBe(true)
    expect(isValidSystemPropKey('bad')).toBe(false)
  })

  it('reads defaults when file missing', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    expect(getSystemPropValue('app.dev.port')).toBe('9080')
  })

  it('parses file content', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue('app.dev.port=3000\n# comment\n')
    expect(getSystemPropValue('app.dev.port')).toBe('3000')
  })

  it('applies env overrides over config.properties and defaults', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(getEnvOverrides).mockReturnValue(
      new Map([['app.metrics.graphqlUrl', 'http://metrics.example/graphql']]),
    )

    expect(getSystemPropValue('app.metrics.graphqlUrl')).toBe(
      'http://metrics.example/graphql',
    )
  })

  it('getSystemPropValues returns all or picked keys', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const all = getSystemPropValues()
    expect(all['memory.recording.block']).toBe('true')
    const picked = getSystemPropValues(['app.dev.port', 'missing.key'])
    expect(picked['app.dev.port']).toBe('9080')
    expect(picked['missing.key']).toBeUndefined()
  })

  it('ignores env-only keys persisted in config.properties', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      [
        'app.openfde.googleAuthLoginUrl=http://localhost:8000/auth/login',
        'app.base.apiUrl=http://localhost:8000',
      ].join('\n'),
    )
    vi.mocked(getEnvOverrides).mockReturnValue(
      new Map([['app.base.apiUrl', 'https://staging.example.com/']]),
    )

    expect(getSystemPropValue('app.base.apiUrl')).toBe('https://staging.example.com/')
    expect(getSystemPropValue('app.openfde.googleAuthLoginUrl')).toBe('')
  })

  it('ensureSystemPropFile strips env-only keys from config.properties', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      'app.openfde.googleAuthLoginUrl=http://localhost:8000/auth/login\napp.dev.port=3000\n',
    )

    ensureSystemPropFile()

    const body = String(writeFileSync.mock.calls.at(-1)?.[1])
    expect(body).toContain('app.dev.port=3000')
    expect(body).not.toContain('app.openfde.googleAuthLoginUrl')
    expect(body).not.toContain('localhost:8000')
  })

  it('setSystemPropValue rejects env-only keys', () => {
    expect(() =>
      setSystemPropValue('app.base.apiUrl', 'http://localhost:8000'),
    ).toThrow(/build time/)
  })

  it('setSystemPropValue writes merged map', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    setSystemPropValue('app.dev.port', 1234)
    expect(writeFileSync).toHaveBeenCalled()
    const body = String(writeFileSync.mock.calls.at(-1)?.[1])
    expect(body).toContain('app.dev.port=1234')
  })

  it('ensureSystemPropFile returns path', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    expect(ensureSystemPropFile()).toBe(getSystemPropFilePath())
  })
})
