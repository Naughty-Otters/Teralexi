import { describe, expect, it, vi, beforeEach } from 'vitest'

const {
  BrowserWindow,
  createSplashWindowOptions,
  showSplashOnReady,
  getBootstrapLoadingURL,
} = vi.hoisted(() => ({
  BrowserWindow: vi.fn(),
  createSplashWindowOptions: vi.fn((webPreferences: unknown) => ({
    width: 200,
    height: 170,
    webPreferences,
  })),
  showSplashOnReady: vi.fn(),
  getBootstrapLoadingURL: vi.fn(() => 'file:///bootstrap-loader.html'),
}))

vi.mock('electron', () => ({
  BrowserWindow,
}))

vi.mock('./config/static-path', () => ({
  getBootstrapLoadingURL,
}))

vi.mock('./services/splash-window', () => ({
  createSplashWindowOptions,
  showSplashOnReady,
}))

import { createBootstrapSplash } from './bootstrap-splash'

describe('createBootstrapSplash', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    BrowserWindow.mockImplementation(function BrowserWindowMock() {
      return {
        loadURL: vi.fn(),
      }
    })
  })

  it('creates a sandboxed splash window and loads bootstrap html', () => {
    const splash = createBootstrapSplash()

    expect(createSplashWindowOptions).toHaveBeenCalledWith({
      experimentalFeatures: true,
      preload: undefined,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    })
    expect(BrowserWindow).toHaveBeenCalledTimes(1)
    expect(showSplashOnReady).toHaveBeenCalledWith(splash)
    expect(splash.loadURL).toHaveBeenCalledWith('file:///bootstrap-loader.html')
    expect(getBootstrapLoadingURL).toHaveBeenCalled()
  })
})
