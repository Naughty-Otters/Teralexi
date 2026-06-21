// Defines static file path locations
import { join } from 'path'
import config from '@config/index'
import { app } from 'electron'
import { isPackagedApp, resolveAppRoot } from './app-paths'
import { resolveBuildIconsDir } from './app-icons'
import { createLogger, traceFunction } from '@main/logger'

const log = createLogger('config.static-path')

let env: 'production' | 'development' = 'development'
export let winURL = ''
export let loadingURL = ''
export let lib = ''
export let updateFolder = ''

const filePath = {
  getPreloadFile(fileName: string) {
    const root = isPackagedApp() ? app.getAppPath() : resolveAppRoot()
    return join(root, 'dist', 'electron', 'main', `${fileName}.js`)
  },
}

function getAppRootPath(path: string) {
  return env !== 'development'
    ? join(__dirname, '..', '..', '..', '..', path).replace(/\\/g, '\\\\')
    : join(__dirname, '..', '..', '..', path).replace(/\\/g, '\\\\')
}

/** Resolve paths once Electron `app` is available (after branding setup). */
export function initStaticPaths(): void {
  env = app.isPackaged ? 'production' : 'development'

  winURL =
    env === 'development'
      ? `http://localhost:${process.env.PORT}`
      : `file://${join(app.getAppPath(), 'dist', 'electron', 'renderer', 'index.html')}`

  loadingURL =
    env === 'development'
      ? `http://localhost:${process.env.PORT}/loader.html`
      : `file://${join(app.getAppPath(), 'dist', 'electron', 'renderer', 'loader.html')}`

  process.env.__static =
    env === 'development'
      ? join(__dirname, '..', '..', '..', 'src', 'renderer', 'public').replace(
          /\\/g,
          '\\\\',
        )
      : join(app.getAppPath(), 'dist', 'electron', 'renderer').replace(
          /\\/g,
          '\\\\',
        )

  lib = getAppRootPath(config.DllFolder)
  updateFolder = getAppRootPath(config.HotUpdateFolder)
  process.env.__lib = lib
  process.env.__updateFolder = updateFolder
}

export function getWinURL(): string {
  return winURL
}

export function getLoadingURL(): string {
  return loadingURL
}

export const getPreloadFile = traceFunction(
  log,
  'getPreloadFile',
  filePath.getPreloadFile.bind(filePath),
)

export const getIconPath = traceFunction(log, 'getIconPath', (filename: string): string => {
  return join(resolveBuildIconsDir(), filename)
})
