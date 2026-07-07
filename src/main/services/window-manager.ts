import config from '@config/index'
import { isTeralexiTestMode } from '@config/test-mode'
import { getSystemPropValue } from '@config/system-prop'
import {
  parseAppAppearance,
  APP_UI_APPEARANCE_KEY,
} from '@shared/ui/appearance-settings'
import {
  applyWindowGlassEffect,
  glassBrowserWindowOptions,
} from './window-glass'
import { app, BrowserWindow, dialog, nativeTheme } from 'electron'
import { getLoadingURL, getPreloadFile, getWinURL } from '../config/static-path'
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
    this.shartURL = getLoadingURL()
    this.childProcessGone = childProcessGone
    this.mainWindowGone = mainWindowGone
  }
  // Main window constructor
  createMainWindow() {
    log.info('Creating main application window')
    const windowIcon = loadWindowIcon()
    const appearance = parseAppAppearance(
      getSystemPropValue(APP_UI_APPEARANCE_KEY),
    )

    this.mainWindow = new BrowserWindow({
      title: APP_DISPLAY_NAME,
      titleBarOverlay: {
        color: '#fff',
      },
      titleBarStyle: config.IsUseSysTitle ? 'default' : 'hidden',
      height: 800,
      useContentSize: true,
      width: 1700,
      minWidth: 1366,
      show: false,
      frame: config.IsUseSysTitle,
      icon: windowIcon,
      ...glassBrowserWindowOptions(appearance),
      webPreferences: {
        sandbox: false,
        webSecurity: false,
        // DevTools available in development mode
        devTools: process.env.NODE_ENV === 'development',
        // Enable rubber-band scrolling on macOS
        scrollBounce: process.platform === 'darwin',
        preload: getPreloadFile('preload'),
      },
    })

    // Load main window
    attachRendererDiagnostics(this.mainWindow.webContents)
    attachSandboxPreviewNavigation(this.mainWindow.webContents, this.winURL)
    this.mainWindow.loadURL(this.winURL)
    // Show window after dom-ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show()
      this.destroyLoadingWindow()
      scheduleDeferredAppCacheAgentWarm(DEFAULT_USER_ID)
      scheduleStartupUpdateCheck(this.mainWindow)
    })
    // Auto-open devtools in development mode
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.webContents.openDevTools({
        mode: 'undocked',
        activate: true,
      })
    }
    // Triggered when the page in this window becomes unresponsive
    this.mainWindowGone(this.mainWindow)
    /**
     * GPU crash detection. See: http://www.electronjs.org/docs/api/app
     * @returns {void}
     * @author zmr (umbrella22)
     * @date 2020-11-27
     */
    this.childProcessGone(this.mainWindow)
    // Hide to tray instead of closing; actual quit comes from tray menu or app.quit()
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

  // Loading window constructor
  loadingWindow(loadingURL: string) {
    log.info('Creating loading window')
    const useDarkSplash = nativeTheme.shouldUseDarkColors
    this.loadWindow = new BrowserWindow({
      width: 200,
      height: 170,
      frame: false,
      skipTaskbar: true,
      transparent: false,
      backgroundColor: useDarkSplash ? '#18181b' : '#fafafa',
      resizable: false,
      show: false,
      center: true,
      roundedCorners: true,
      webPreferences: {
        experimentalFeatures: true,
        preload: getPreloadFile('preload'),
      },
    })

    const beginMainWindow = () => {
      if (this.mainWindow) return
      this.createMainWindow()
    }

    // Register before loadURL so we never miss ready-to-show on a fast/cached load.
    this.loadWindow.once('ready-to-show', () => {
      this.loadWindow.show()
      this.loadWindow.setAlwaysOnTop(true)
      beginMainWindow()
    })

    void warmAppCacheOnStartup(DEFAULT_USER_ID)
    this.loadWindow.loadURL(loadingURL)
  }
  // Initialize window
  initWindow() {
    const useStartupChart = config.UseStartupChart && !isTeralexiTestMode()
    log.info('Initializing window flow', {
      useStartupChart,
      testMode: isTeralexiTestMode(),
    })
    if (useStartupChart) {
      return this.loadingWindow(this.shartURL)
    }
    void warmAppCacheOnStartup(DEFAULT_USER_ID).then(() => {
      scheduleDeferredAppCacheAgentWarm(DEFAULT_USER_ID)
    })
    return this.createMainWindow()
  }
}
export default MainInit
