import { describe, expect, it, vi, beforeEach } from 'vitest'
import { join } from 'node:path'
import { p, pathEndsWith } from '@test-paths'

const mockApp = {
  isPackaged: false,
  getAppPath: vi.fn(() => '/app'),
  setName: vi.fn(),
}

vi.mock('electron', () => ({
  app: mockApp,
  screen: {
    getPrimaryDisplay: vi.fn(() => ({ scaleFactor: 2 })),
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({
      isEmpty: () => false,
      getSize: () => ({ width: 44, height: 44 }),
      setTemplateImage: vi.fn(),
      resize: vi.fn(function resize() {
        return { isEmpty: () => false, getSize: () => ({ width: 22, height: 22 }), setTemplateImage: vi.fn() }
      }),
    })),
  },
}))

vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) =>
    String(path).includes('favicon.png') ||
    String(path).includes('openfde-logo.png') ||
    String(path).includes('openfde-tray-icon.png') ||
    String(path).includes('tray-icon.png') ||
    String(path).includes('icon.icns'),
  ),
}))

describe('app-icons', () => {
  beforeEach(() => {
    vi.resetModules()
    mockApp.isPackaged = false
    mockApp.getAppPath.mockReturnValue('/app')
  })

  it('configureAppBranding sets the product name', async () => {
    const { configureAppBranding, APP_DISPLAY_NAME } = await import('./app-icons')
    configureAppBranding()
    expect(APP_DISPLAY_NAME).toBe('OpenFDE')
    expect(mockApp.setName).toHaveBeenCalledWith('OpenFDE')
  })

  it('loadTrayIcon resolves logo PNG', async () => {
    const { loadTrayIcon } = await import('./app-icons')
    const icon = loadTrayIcon()
    expect(icon.isEmpty()).toBe(false)
  })

  it('resolveBuildIconsDir prefers Resources/build/icons when packaged', async () => {
    mockApp.isPackaged = true
    mockApp.getAppPath.mockReturnValue('/OpenFDE.app/Contents/Resources/app.asar')
    const existsSync = vi.fn((target: string) =>
      pathEndsWith(String(target), 'Resources/build/icons/tray-icon.png'),
    )
    vi.doMock('fs', () => ({ existsSync }))
    const { resolveBuildIconsDir } = await import('./app-icons')
    expect(p(resolveBuildIconsDir())).toBe(
      p('/OpenFDE.app/Contents/Resources/build/icons'),
    )
  })

  it('getTrayIconPngPath prefers build tray icons before dev source paths', async () => {
    mockApp.isPackaged = false
    // @2x is preferred only on macOS HiDPI displays; pin the platform so the
    // assertion is deterministic on Linux/Windows CI runners.
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    })
    try {
      const existsSync = vi.fn((path: string) => {
        const normalized = String(path).replace(/\\/g, '/')
        return (
          normalized.endsWith('/build/icons/tray-icon@2x.png') ||
          normalized.endsWith('/build/icons/tray-icon.png')
        )
      })
      vi.doMock('fs', () => ({ existsSync }))
      const { getTrayIconPngPath } = await import('./app-icons')
      expect(p(getTrayIconPngPath())).toMatch(/\/build\/icons\/tray-icon@2x\.png$/)
    } finally {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      })
    }
  })
})
