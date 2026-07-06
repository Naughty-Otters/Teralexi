import { app } from 'electron'
import { version as packageVersion } from '../../../package.json'

/**
 * teralexi application semver.
 *
 * When running unpackaged (`npm run dev`), Electron's `app.getVersion()` returns
 * the Electron runtime version (e.g. 38.x), not package.json. Use package.json
 * in that case so About/update UI shows the product version.
 */
export function resolveAppVersion(): string {
  if (!app.isPackaged) {
    return packageVersion
  }
  return app.getVersion()
}
