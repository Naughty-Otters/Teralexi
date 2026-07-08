import { BrowserWindow, nativeTheme, type BrowserWindowConstructorOptions } from 'electron'

/** Shared splash dimensions and chrome for bootstrap and window-manager paths. */
export function createSplashWindowOptions(
  webPreferences: BrowserWindowConstructorOptions['webPreferences'],
): BrowserWindowConstructorOptions {
  const useDarkSplash = nativeTheme.shouldUseDarkColors
  return {
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
    webPreferences,
  }
}

export function showSplashOnReady(
  splash: BrowserWindow,
  onReady?: () => void,
): void {
  splash.once('ready-to-show', () => {
    if (!splash.isDestroyed()) {
      splash.show()
      splash.setAlwaysOnTop(true)
    }
    onReady?.()
  })
}
