import { describe, expect, it, vi } from 'vitest'

vi.mock('./system-prop', () => ({
  ensureSystemPropFile: vi.fn(),
  getSystemPropValue: vi.fn((key: string, fallback?: string) => {
    const map: Record<string, string> = {
      'app.build.hotPublishUrl': 'https://updates.example',
      'app.build.hotPublishConfigName': 'cfg',
      'app.dev.removeElectronJunk': 'true',
      'app.dev.chineseLog': 'false',
      'app.dev.port': '9080',
      'app.paths.dllFolder': 'dll',
      'app.paths.hotUpdateFolder': 'update',
      'app.window.useStartupChart': 'true',
      'app.window.useSystemTitle': 'false',
      'app.google.clientId': 'id',
      'app.google.clientSecret': 'secret',
    }
    return map[key] ?? fallback ?? ''
  }),
}))

import config from './index'

describe('config index', () => {
  it('maps build and dev settings', () => {
    expect(config.build.hotPublishUrl).toBe('https://updates.example')
    expect(config.dev.port).toBe(9080)
    expect(config.dev.removeElectronJunk).toBe(true)
    expect(config.dev.chineseLog).toBe(false)
  })

  it('maps window and google settings', () => {
    expect(config.UseStartupChart).toBe(true)
    expect(config.IsUseSysTitle).toBe(false)
    expect(config.google.clientId).toBe('id')
  })

  it('maps path folders', () => {
    expect(config.DllFolder).toBe('dll')
    expect(config.HotUpdateFolder).toBe('update')
  })

  it('falls back for non-boolean dev flags', async () => {
    vi.resetModules()
    vi.doMock('./system-prop', () => ({
      ensureSystemPropFile: vi.fn(),
      getSystemPropValue: vi.fn((key: string, fallback?: string) => {
        if (key === 'app.dev.removeElectronJunk') return 'maybe'
        if (key === 'app.dev.chineseLog') return 'TRUE'
        if (key === 'app.window.useStartupChart') return 'nope'
        return fallback ?? ''
      }),
    }))
    const { default: cfg } = await import('./index')
    expect(cfg.dev.removeElectronJunk).toBe(true)
    expect(cfg.dev.chineseLog).toBe(true)
    expect(cfg.UseStartupChart).toBe(true)
  })

  it('falls back when dev.port is not numeric', async () => {
    vi.resetModules()
    vi.doMock('./system-prop', () => ({
      ensureSystemPropFile: vi.fn(),
      getSystemPropValue: vi.fn((key: string, fallback?: string) => {
        if (key === 'app.dev.port') return 'not-a-port'
        return fallback ?? ''
      }),
    }))
    const { default: cfg } = await import('./index')
    expect(cfg.dev.port).toBe(9080)
  })
})
