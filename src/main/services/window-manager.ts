import config from '@config/index'
import { isTeralexiTestMode } from '@config/test-mode'
import { getSystemPropValue } from '@config/system-prop'
import {
  parseAppAppearance,
  APP_UI_APPEARANCE_KEY,
} from '@shared/ui/appearance-settings'
import { glassBrowserWindowOptions } from './window-glass'
import { app, BrowserWindow } from 'electron'
import {
  getBootstrapLoadingURL,
  getPreloadFile,
  getWinURL,
} from '../config/static-path'
import { APP_DISPLAY_NAME, loadWindowIcon } from '../config/app-icons'
import { useProcessException } from '@main/hooks/exception-hook'
import { createLogger, instrumentInstanceMethods } from '@main/logger'
import {
  scheduleDeferredAppCacheAgentWarm,
  warmAppCacheOnStartup,
} from '@main/cache/cache-warmer'
import { scheduleStartupUpdateCheck } from './check-update'
import { DEFAULT_USER_ID } from '@main/agent/config/config'
import { attachSandboxPreviewNavigation } from './sandbox-preview-navigation'
import {
  createSplashWindowOptions,
  showSplashOnReady,
} from './splash-window'
import {
  attachMainWindowStatePersistence,
  ensureBoundsOnScreen,
  loadMainWindowBounds,
} from './main-window-state'
import {
  DEFAULT_MAIN_WINDOW_HEIGHT,
  DEFAULT_MAIN_WINDOW_WIDTH,
  MAIN_WINDOW_MIN_HEIGHT,
  MAIN_WINDOW_MIN_WIDTH,
} from '@shared/ui/main-window-state'

const log = createLogger('services.window-manager')

function attachRendererDiagnostics(webContents: Electron.WebContents): void {
  webContents.on('did-fail-load', (_event, errorCode, errorDescription, url) => {
    log.error('Renderer failed to load', {
      errorCode,
      errorDescription,
      url,
    })
  })

  webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const payload = { message, line, sourceId }
    if (level === 3) log.error('Renderer console error', payload)
    else if (level === 2) log.warn('Renderer console warning', payload)
    else log.info('Renderer console', payload)
  })

  webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process gone', details)
  })
}

class MainInit {
  public winURL: string = ''
  public shartURL: string = ''
  public loadWindow: BrowserWindow = null
  public mainWindow: BrowserWindow = null
  private childProcessGone = null
  private mainWindowGone = null

  constructor() {
    instrumentInstanceMethods(this, log)
    const { childProcessGone, mainWindowGone } = useProcessException()
    this.winURL = getWinURL()
    this.shartURL = getBootstrapLoadingURL()
    this.childProcessGone = childProcessGone
    this.mainWindowGone = mainWindowGone
  }

  createMainWindow() {
    log.info('Creating main application window', { winURL: this.winURL })
    const windowIcon = loadWindowIcon()
    const appearance = parseAppAppearance(
      getSystemPropValue(APP_UI_APPEARANCE_KEY),
    )

    const savedBounds = ensureBoundsOnScreen(loadMainWindowBounds())

    this.mainWindow = new BrowserWindow({
      title: APP_DISPLAY_NAME,
      titleBarOverlay: {
        color: '#fff',
      },
      titleBarStyle: config.IsUseSysTitle ? 'default' : 'hidden',
      height: savedBounds.height || DEFAULT_MAIN_WINDOW_HEIGHT,
      useContentSize: true,
      width: savedBounds.width || DEFAULT_MAIN_WINDOW_WIDTH,
      x: Number.isFinite(savedBounds.x) ? savedBounds.x : undefined,
      y: Number.isFinite(savedBounds.y) ? savedBounds.y : undefined,
      minWidth: MAIN_WINDOW_MIN_WIDTH,
      minHeight: MAIN_WINDOW_MIN_HEIGHT,
      show: false,
      frame: config.IsUseSysTitle,
      icon: windowIcon,
      ...glassBrowserWindowOptions(appearance),
      webPreferences: {
        sandbox: false,
        webSecurity: false,
        devTools: process.env.NODE_ENV === 'development',
        scrollBounce: process.platform === 'darwin',
        preload: getPreloadFile('preload'),
      },
    })

    if (savedBounds.isMaximized) {
      this.mainWindow.maximize()
    }

    attachMainWindowStatePersistence(this.mainWindow)
    attachRendererDiagnostics(this.mainWindow.webContents)
    attachSandboxPreviewNavigation(this.mainWindow.webContents, this.winURL)
    this.mainWindow.loadURL(this.winURL)
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show()
      this.destroyLoadingWindow()
      scheduleDeferredAppCacheAgentWarm(DEFAULT_USER_ID)
      scheduleStartupUpdateCheck(this.mainWindow)
    })
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.webContents.openDevTools({
        mode: 'undocked',
        activate: true,
      })
    }
    this.mainWindowGone(this.mainWindow)
    this.childProcessGone(this.mainWindow)
    this.mainWindow.on('close', (e) => {
      if (!app.isQuiting) {
        e.preventDefault()
        this.mainWindow.hide()
      }
    })
  }

  private destroyLoadingWindow(): void {
    if (!config.UseStartupChart || !this.loadWindow) return
    if (!this.loadWindow.isDestroyed()) {
      this.loadWindow.destroy()
    }
    this.loadWindow = null
  }

  adoptBootstrapSplash(splash: BrowserWindow): void {
    this.loadWindow = splash
  }

  private beginMainWindowAfterSplash(): void {
    if (this.mainWindow) return
    void warmAppCacheOnStartup(DEFAULT_USER_ID)
    this.createMainWindow()
  }

  private whenSplashReady(splash: BrowserWindow, onReady: () => void): void {
    if (splash.isDestroyed()) {
      onReady()
      return
    }

    const run = () => {
      if (!splash.isDestroyed() && !splash.isVisible()) {
        splash.show()
        splash.setAlwaysOnTop(true)
      }
      onReady()
    }

    if (splash.isVisible() || !splash.webContents.isLoading()) {
      run()
      return
    }

    splash.once('ready-to-show', run)
  }

  loadingWindow(loadingURL: string) {
    log.info('Creating loading window')
    this.loadWindow = new BrowserWindow(
      createSplashWindowOptions({
        experimentalFeatures: true,
        preload: getPreloadFile('preload'),
      }),
    )

    showSplashOnReady(this.loadWindow, () => {
      this.beginMainWindowAfterSplash()
    })

    void warmAppCacheOnStartup(DEFAULT_USER_ID)
    this.loadWindow.loadURL(loadingURL)
  }

  initWindow() {
    const useStartupChart = config.UseStartupChart && !isTeralexiTestMode()
    log.info('Initializing window flow', {
      useStartupChart,
      testMode: isTeralexiTestMode(),
      hasBootstrapSplash: Boolean(this.loadWindow),
    })

    if (useStartupChart && this.loadWindow) {
      log.info('Continuing with bootstrap splash window')
      this.whenSplashReady(this.loadWindow, () => {
        this.beginMainWindowAfterSplash()
      })
      return
    }

    if (useStartupChart) {
      return this.loadingWindow(this.shartURL)
    }

    void warmAppCacheOnStartup(DEFAULT_USER_ID).then(() => {
      scheduleDeferredAppCacheAgentWarm(DEFAULT_USER_ID)
    })
    this.createMainWindow()
  }
}

export default MainInit
