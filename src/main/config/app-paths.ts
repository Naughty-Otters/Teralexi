import { app } from 'electron'
import { join } from 'path'

export function isPackagedApp(): boolean {
  return app?.isPackaged === true
}

/** On-disk app root: repo cwd in dev, `app.asar.unpacked` when packaged. */
export function resolveAppRoot(): string {
  if (isPackagedApp()) {
    return app.getAppPath().replace(/\.asar$/i, '.asar.unpacked')
  }
  return process.cwd()
}

/** Repo-root resource path in dev; extracted bundle path when packaged. */
export function joinAppResourcePath(...segments: string[]): string {
  return join(resolveAppRoot(), ...segments)
}

/** Map virtual `app.asar/...` paths to on-disk `app.asar.unpacked/...`. */
export function toOnDiskAppPath(filePath: string): string {
  if (isPackagedApp() && filePath.includes('app.asar')) {
    return filePath.replace(/app\.asar(?=\/|$)/i, 'app.asar.unpacked')
  }
  return filePath
}
