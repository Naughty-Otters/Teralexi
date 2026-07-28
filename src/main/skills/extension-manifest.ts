import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createLogger } from '@main/logger'
import type { ExtensionManifest } from '@teralexi/skill-sdk'
import { EXTENSION_FILES, EXTENSION_LOADER_LOG } from './constants'
import { parseExtensionManifest } from './extension-manifest-schema'

const log = createLogger('skills.extension-manifest')

/**
 * Reads and validates `extension.json` for one extension directory.
 * `extension.json` is optional — a bare skill directory with no manifest
 * returns `null` here without logging, exactly like a skill with no
 * `properties.md` customization falls back to defaults elsewhere.
 */
export function loadExtensionManifest(extensionDir: string): ExtensionManifest | null {
  const manifestPath = join(extensionDir, EXTENSION_FILES.MANIFEST_JSON)
  if (!existsSync(manifestPath)) return null

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch (err) {
    log.warn(EXTENSION_LOADER_LOG.SKIPPED_FAILED, { extensionDir, err })
    return null
  }

  const result = parseExtensionManifest(raw)
  if (!result.ok) {
    log.warn(EXTENSION_LOADER_LOG.SKIPPED_INVALID, {
      extensionDir,
      message: result.message,
    })
    return null
  }

  return result.manifest
}
