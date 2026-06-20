import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('@config/openfde-home', () => ({
  getopenfdeConfigDir: vi.fn(() => '/mock/.openfde/config'),
  getopenfdeSystemPropPath: vi.fn(() => '/mock/.openfde/config/config.properties'),
}))

import { existsSync, readFileSync, writeFileSync } from 'fs'
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

  it('validates three-part keys', () => {
    expect(isValidSystemPropKey('app.dev.port')).toBe(true)
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

  it('getSystemPropValues returns all or picked keys', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const all = getSystemPropValues()
    expect(all['memory.recording.block']).toBe('true')
    const picked = getSystemPropValues(['app.dev.port', 'missing.key'])
    expect(picked['app.dev.port']).toBe('9080')
    expect(picked['missing.key']).toBeUndefined()
  })

  it('setSystemPropValue rejects invalid keys', () => {
    expect(() => setSystemPropValue('bad', 'x')).toThrow(/Invalid/)
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
