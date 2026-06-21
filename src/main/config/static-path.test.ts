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
    mod.initStaticPaths()
    expect(mod.getWinURL()).toContain('5173')
    expect(mod.getLoadingURL()).toContain('loader.html')
    expect(typeof mod.getPreloadFile).toBe('function')
    expect(typeof mod.getIconPath).toBe('function')
  })

  it('getPreloadFile points at dist/electron/main in development', async () => {
    const { getPreloadFile, initStaticPaths } = await import('./static-path')
    initStaticPaths()
    expect(getPreloadFile('preload')).toBe(
      join(process.cwd(), 'dist', 'electron', 'main', 'preload.js'),
    )
  })

  it('getIconPath points at build/icons in development', async () => {
    const { getIconPath, initStaticPaths } = await import('./static-path')
    initStaticPaths()
    expect(getIconPath('icon.png')).toContain(join('build', 'icons', 'icon.png'))
  })

  it('uses production paths when packaged', async () => {
    mockApp.isPackaged = true
    vi.resetModules()
    const mod = await import('./static-path')
    mod.initStaticPaths()
    expect(mod.getWinURL().startsWith('file://')).toBe(true)
    expect(mod.getPreloadFile('preload')).toContain(
      join('dist', 'electron', 'main', 'preload.js'),
    )
  })
})
