import { describe, expect, it, vi } from 'vitest'

function makeWindow() {
  return {
    loadURL: vi.fn(),
    on: vi.fn(),
    once: vi.fn((event: string, cb: () => void) => {
      if (event === 'ready-to-show') cb()
    }),
    show: vi.fn(),
    hide: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    webContents: { openDevTools: vi.fn() },
  }
}

const { BrowserWindow } = vi.hoisted(() => ({
  BrowserWindow: vi.fn(function BrowserWindowMock() {
    return makeWindow()
  }),
}))

vi.mock('electron', () => ({
  app: { isQuiting: false },
  BrowserWindow,
  screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
  nativeImage: {
    createFromPath: vi.fn(() => ({
      isEmpty: () => false,
      resize: vi.fn(function resize() {
        return { isEmpty: () => false }
      }),
    })),
  },
  dialog: {},
}))

vi.mock('@config/index', () => ({
  default: { UseStartupChart: false, IsUseSysTitle: true },
}))

vi.mock('@main/hooks/exception-hook', () => ({
  useProcessException: () => ({
    childProcessGone: vi.fn(),
    mainWindowGone: vi.fn(),
  }),
}))

vi.mock('../config/static-path', () => ({
  winURL: 'http://localhost',
  loadingURL: 'http://localhost/loader',
  getPreloadFile: vi.fn(() => '/preload.js'),
  getIconPath: vi.fn((name: string) => `/icons/${name}`),
}))

vi.mock('@main/cache/cache-warmer', () => ({
  warmAppCacheOnStartup: vi.fn(() => Promise.resolve()),
}))

import MainInit from './window-manager'
import { warmAppCacheOnStartup } from '@main/cache/cache-warmer'

describe('window-manager', () => {
  it('creates main window on init', () => {
    const init = new MainInit()
    init.initWindow()
    expect(BrowserWindow).toHaveBeenCalled()
    expect(init.mainWindow).toBeDefined()
    expect(warmAppCacheOnStartup).toHaveBeenCalledWith('default')
  })
})
