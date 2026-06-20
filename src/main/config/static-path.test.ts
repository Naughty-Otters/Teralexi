import { describe, expect, it, vi, beforeEach } from 'vitest'
import { join } from 'path'

const mockApp = {
  isPackaged: false,
  getAppPath: vi.fn(() => '/app'),
}

vi.mock('electron', () => ({ app: mockApp }))
vi.mock('@config/index', () => ({
  default: { DllFolder: 'dll', HotUpdateFolder: 'update' },
}))

describe('static-path', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.PORT = '5173'
    mockApp.isPackaged = false
  })

  it('exports development URLs and helpers', async () => {
    const mod = await import('./static-path')
    expect(mod.winURL).toContain('5173')
    expect(mod.loadingURL).toContain('loader.html')
    expect(typeof mod.getPreloadFile).toBe('function')
    expect(typeof mod.getIconPath).toBe('function')
  })

  it('getPreloadFile uses app path in development', async () => {
    const { getPreloadFile } = await import('./static-path')
    expect(getPreloadFile('preload')).toBe(join('/app', 'preload.js'))
  })

  it('getIconPath points at build/icons in development', async () => {
    const { getIconPath } = await import('./static-path')
    expect(getIconPath('icon.png')).toContain(join('build', 'icons', 'icon.png'))
  })

  it('uses production paths when packaged', async () => {
    mockApp.isPackaged = true
    vi.resetModules()
    const { getPreloadFile, winURL } = await import('./static-path')
    expect(winURL.startsWith('file://')).toBe(true)
    expect(getPreloadFile('preload')).toContain(
      join('dist', 'electron', 'main', 'preload.js'),
    )
  })
})
