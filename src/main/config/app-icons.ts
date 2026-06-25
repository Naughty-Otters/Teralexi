import { existsSync } from 'fs'
import { join } from 'path'
import { app, nativeImage, screen, type NativeImage } from 'electron'
import { createLogger } from '@main/logger'
import { toOnDiskAppPath } from './app-paths'

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
  if (app.isPackaged) {
    return app.getAppPath()
  }
  return process.cwd()
}

/** Packaged apps store icons under Resources/build/icons (extraResources). */
export function resolveBuildIconsDir(): string {
  if (!app.isPackaged) {
    return join(process.cwd(), 'build', 'icons')
  }

  const appPath = app.getAppPath()
  const resolved = firstExistingPath([
    join(appPath, '..', 'build', 'icons'),
    join(appPath, '..', '..', 'build', 'icons'),
    join(appPath, 'build', 'icons'),
  ])
  if (resolved) return resolved

  log.warn('Build icons directory not found in packaged app', { appPath })
  return join(appPath, '..', 'build', 'icons')
}

function firstExistingPath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Source-of-truth app icon PNG (dock, window, favicon). */
export function getAppIconPngPath(): string {
  const root = projectRoot()
  const resolved = firstExistingPath([
    join(resolveBuildIconsDir(), 'icon.png'),
    join(root, 'src', 'renderer', 'public', 'favicon.png'),
    join(root, 'src', 'renderer', 'assets', 'icons', 'openfde-logo.png'),
    join(root, 'dist', 'electron', 'renderer', 'favicon.png'),
  ])
  if (!resolved) {
    throw new Error('openfde-logo.png not found')
  }
  return resolved
}

/** macOS menu bar slot — 22pt matches common menu bar icon size. */
const MENU_BAR_TRAY_PX = 22

function menuBarTrayPixelSize(): number {
  if (process.platform !== 'darwin') return 38
  return MENU_BAR_TRAY_PX
}

/** Bold template PNG for the macOS menu bar / system tray. */
export function getTrayIconPngPath(): string {
  const root = projectRoot()
  const buildIcons = resolveBuildIconsDir()
  const use2x = process.platform === 'darwin' && screen.getPrimaryDisplay().scaleFactor >= 2
  const buildTrayCandidates = use2x
    ? [join(buildIcons, 'tray-icon@2x.png'), join(buildIcons, 'tray-icon.png')]
    : [join(buildIcons, 'tray-icon.png'), join(buildIcons, 'tray-icon@2x.png')]
  const candidates = [
    ...buildTrayCandidates,
    join(root, 'src', 'renderer', 'assets', 'icons', 'openfde-tray-icon.png'),
    join(root, 'src', 'renderer', 'assets', 'icons', 'openfde-logo.png'),
    join(buildIcons, 'icon.png'),
  ]
  const resolved = firstExistingPath(candidates)
  if (!resolved) {
    throw new Error('tray icon PNG not found')
  }
  return resolved
}

function isTrayTemplateIconPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  return (
    normalized.includes('openfde-tray-icon') ||
    normalized.endsWith('/tray-icon.png') ||
    normalized.endsWith('/tray-icon@2x.png')
  )
}

/** @deprecated Use {@link getAppIconPngPath} */
export function getFaviconSvgPath(): string {
  return getAppIconPngPath()
}

function loadNativeImageFromPath(path: string): NativeImage {
  const diskPath = toOnDiskAppPath(path)
  const image = nativeImage.createFromPath(diskPath)
  if (image.isEmpty()) {
    log.warn('Native image failed to load', { path, diskPath })
  }
  return image
}

function resizeSquare(image: NativeImage, size: number): NativeImage {
  if (image.isEmpty()) return image
  return image.resize({ width: size, height: size, quality: 'best' })
}

function finalizeTrayIcon(image: NativeImage, pngPath: string): NativeImage {
  if (image.isEmpty()) return image
  if (process.platform === 'darwin' && isTrayTemplateIconPath(pngPath)) {
    image.setTemplateImage(true)
  }
  return image
}

/** macOS menu bar / system tray — bold template PNG at menu-bar size. */
export function loadTrayIcon(): NativeImage {
  const pngPath = getTrayIconPngPath()
  const targetSize = menuBarTrayPixelSize()
  const loaded = loadNativeImageFromPath(pngPath)
  const { width, height } = loaded.getSize()
  const image =
    width === targetSize && height === targetSize
      ? loaded
      : resizeSquare(loaded, targetSize)
  if (!image.isEmpty()) {
    return finalizeTrayIcon(image, pngPath)
  }

  const fallback = join(resolveBuildIconsDir(), 'tray-icon.png')
  log.warn('Falling back to tray PNG', { fallback })
  const fallbackImage = finalizeTrayIcon(
    resizeSquare(loadNativeImageFromPath(fallback), targetSize),
    fallback,
  )
  if (fallbackImage.isEmpty()) {
    log.error('Tray icon PNG could not be loaded', {
      pngPath,
      fallback,
      buildIconsDir: resolveBuildIconsDir(),
    })
  }
  return fallbackImage
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
