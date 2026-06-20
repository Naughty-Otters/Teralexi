import { existsSync } from 'fs'
import { join } from 'path'
import { app, nativeImage, type NativeImage } from 'electron'
import { createLogger } from '@main/logger'

const log = createLogger('config.app-icons')

export const APP_DISPLAY_NAME = 'OpenFDE'

/** Call before `app.whenReady()` so macOS menu / switcher use the product name. */
export function configureAppBranding(): void {
  app.setName(APP_DISPLAY_NAME)
  if (process.platform === 'darwin') {
    process.title = APP_DISPLAY_NAME
  }
}

function projectRoot(): string {
  return app.isPackaged
    ? app.getAppPath()
    : join(__dirname, '..', '..', '..')
}

/** Packaged apps may store icons beside app.asar (asar) or under the app dir (no asar). */
export function resolveBuildIconsDir(): string {
  if (!app.isPackaged) {
    return join(__dirname, '..', '..', '..', 'build', 'icons')
  }
  const inApp = join(app.getAppPath(), 'build', 'icons')
  if (existsSync(inApp)) return inApp
  return join(app.getAppPath(), '..', 'build', 'icons')
}

function firstExistingPath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Source-of-truth app icon PNG (also used for the menu bar tray). */
export function getAppIconPngPath(): string {
  const root = projectRoot()
  const resolved = firstExistingPath([
    join(resolveBuildIconsDir(), 'tray-icon.png'),
    join(root, 'src', 'renderer', 'public', 'favicon.png'),
    join(root, 'src', 'renderer', 'assets', 'icons', 'openfde-logo.png'),
    join(root, 'dist', 'electron', 'renderer', 'favicon.png'),
  ])
  if (!resolved) {
    throw new Error('openfde-logo.png not found')
  }
  return resolved
}

/** @deprecated Use {@link getAppIconPngPath} */
export function getFaviconSvgPath(): string {
  return getAppIconPngPath()
}

function loadNativeImageFromPath(path: string): NativeImage {
  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) {
    log.warn('Native image failed to load', { path })
  }
  return image
}

function resizeSquare(image: NativeImage, size: number): NativeImage {
  if (image.isEmpty()) return image
  return image.resize({ width: size, height: size, quality: 'best' })
}

/** macOS menu bar / system tray — logo PNG at menu-bar size. */
export function loadTrayIcon(): NativeImage {
  const pngPath = getAppIconPngPath()
  const logicalSize = process.platform === 'darwin' ? 28 : 38
  const image = resizeSquare(loadNativeImageFromPath(pngPath), logicalSize)
  if (!image.isEmpty()) {
    return image
  }

  const fallback = join(resolveBuildIconsDir(), 'tray-icon.png')
  log.warn('Falling back to tray PNG', { fallback })
  return loadNativeImageFromPath(fallback)
}

/** Dock (macOS) and window icon — .icns in production, logo PNG fallback in dev. */
export function loadDockIcon(): NativeImage {
  const icnsPath = join(resolveBuildIconsDir(), 'icon.icns')
  if (existsSync(icnsPath)) {
    const icns = loadNativeImageFromPath(icnsPath)
    if (!icns.isEmpty()) return icns
  }

  log.warn('Using logo PNG fallback for dock icon', { icnsPath })
  return resizeSquare(loadNativeImageFromPath(getAppIconPngPath()), 512)
}

/** Taskbar / window icon on Windows and Linux. */
export function loadWindowIcon(): NativeImage {
  if (process.platform === 'darwin') {
    return loadDockIcon()
  }

  const pngPath = join(resolveBuildIconsDir(), '256x256.png')
  if (existsSync(pngPath)) {
    const png = loadNativeImageFromPath(pngPath)
    if (!png.isEmpty()) return png
  }

  return resizeSquare(loadNativeImageFromPath(getAppIconPngPath()), 256)
}
