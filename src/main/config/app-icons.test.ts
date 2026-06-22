import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockApp = {
  isPackaged: false,
  getAppPath: vi.fn(() => '/app'),
  setName: vi.fn(),
}

vi.mock('electron', () => ({
  app: mockApp,
  nativeImage: {
    createFromPath: vi.fn(() => ({
      isEmpty: () => false,
      setTemplateImage: vi.fn(),
      resize: vi.fn(function resize() {
        return { isEmpty: () => false, setTemplateImage: vi.fn() }
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
})
