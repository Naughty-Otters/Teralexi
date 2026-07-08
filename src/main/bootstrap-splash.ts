import { BrowserWindow } from 'electron'
import { getBootstrapLoadingURL } from './config/static-path'
import {
  createSplashWindowOptions,
  showSplashOnReady,
} from './services/splash-window'

/**
 * Minimal splash for bootstrap — shown before the heavy main-app bundle loads.
 * Uses a local file:// URL so it never depends on the Vite dev server.
 */
export function createBootstrapSplash(): BrowserWindow {
  const loadWindow = new BrowserWindow(
    createSplashWindowOptions({
      experimentalFeatures: true,
      preload: undefined,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    }),
  )

  showSplashOnReady(loadWindow)
  void loadWindow.loadURL(getBootstrapLoadingURL())
  return loadWindow
}
