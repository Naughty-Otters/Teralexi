import { describe, expect, it, vi } from 'vitest'

function makeWindow() {
  const onceHandlers = new Map<string, () => void>()
  return {
    loadURL: vi.fn(),
    on: vi.fn(),
    once: vi.fn((event: string, cb: () => void) => {
      onceHandlers.set(event, cb)
    }),
    emitReadyToShow: () => onceHandlers.get('ready-to-show')?.(),
    show: vi.fn(),
    hide: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    isVisible: vi.fn(() => false),
    isDestroyed: vi.fn(() => false),
    destroy: vi.fn(),
    focus: vi.fn(),
    webContents: {
      openDevTools: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      isLoading: vi.fn(() => true),
    },
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
  nativeTheme: { shouldUseDarkColors: false },
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

const appConfig = vi.hoisted(() => ({
  UseStartupChart: false,
  IsUseSysTitle: true,
}))

vi.mock('@config/index', () => ({
  default: appConfig,
}))

vi.mock('@config/test-mode', () => ({
  isTeralexiTestMode: vi.fn(() => false),
}))

vi.mock('@main/hooks/exception-hook', () => ({
  useProcessException: () => ({
    childProcessGone: vi.fn(),
    mainWindowGone: vi.fn(),
  }),
}))

vi.mock('../config/static-path', () => ({
  getWinURL: vi.fn(() => 'http://localhost'),
  getBootstrapLoadingURL: vi.fn(() => 'file:///loader.html'),
  getPreloadFile: vi.fn(() => '/preload.js'),
  getIconPath: vi.fn((name: string) => `/icons/${name}`),
}))

vi.mock('@main/cache/cache-warmer', () => ({
  warmAppCacheOnStartup: vi.fn(() => Promise.resolve()),
  scheduleDeferredAppCacheAgentWarm: vi.fn(() => Promise.resolve()),
}))

import MainInit from './window-manager'
import {
  scheduleDeferredAppCacheAgentWarm,
  warmAppCacheOnStartup,
} from '@main/cache/cache-warmer'

describe('window-manager', () => {
  it('creates main window on init', () => {
    const init = new MainInit()
    init.initWindow()
    expect(BrowserWindow).toHaveBeenCalled()
    expect(init.mainWindow).toBeDefined()
    expect(warmAppCacheOnStartup).toHaveBeenCalledWith('default')
  })

  it('starts main window when the splash is ready without a fixed delay', () => {
    vi.useFakeTimers()
    appConfig.UseStartupChart = true

    const windows: ReturnType<typeof makeWindow>[] = []
    BrowserWindow.mockImplementation(function BrowserWindowMock() {
      const win = makeWindow()
      windows.push(win)
      return win
    })

    const init = new MainInit()
    init.initWindow()

    expect(windows).toHaveLength(1)
    expect(init.mainWindow).toBeNull()

    windows[0].emitReadyToShow()

    expect(windows[0].show).toHaveBeenCalled()
    expect(init.mainWindow).toBeDefined()
    expect(vi.getTimerCount()).toBe(0)

    appConfig.UseStartupChart = false
    vi.useRealTimers()
  })

  it('continues from bootstrap splash using the same ready-to-show sequence', () => {
    appConfig.UseStartupChart = true

    const splash = makeWindow()
    splash.isVisible = vi.fn(() => true)

    const windows: ReturnType<typeof makeWindow>[] = [splash]
    BrowserWindow.mockImplementation(function BrowserWindowMock() {
      const win = makeWindow()
      windows.push(win)
      return win
    })

    const init = new MainInit()
    init.adoptBootstrapSplash(splash as never)
    init.initWindow()

    expect(init.mainWindow).toBeDefined()
    expect(windows.length).toBeGreaterThan(1)
  })
})
