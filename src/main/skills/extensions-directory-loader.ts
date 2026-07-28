import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { createLogger } from '@main/logger'
import type { ExtensionManifest } from '@teralexi/skill-sdk'
import { EXTENSION_LOADER_LOG } from './constants'
import { loadExtensionManifest } from './extension-manifest'
import {
  isLoadableExtensionFolder,
  resolveBundledExtensionsDirectory,
  resolveProjectExtensionsDirectory,
  resolveUserExtensionsDirectory,
} from './skill-path'

const log = createLogger('skills.extensions-loader')

export type ExtensionSource = 'bundled' | 'project' | 'user'

export type LoadedExtension = {
  id: string
  dir: string
  manifest: ExtensionManifest
  source: ExtensionSource
}

type LoadedExtensionEntry = Omit<LoadedExtension, 'source'>

/**
 * Discovery only — reads and validates `extension.json` for every loadable
 * folder in `extensionsDir`. Does not load `actions/index.ts`, does not
 * register any contribution, and does not touch the agent engine. That
 * wiring is a later phase (see docs/EXTENSION-HOOKS-ARCHITECTURE.md §8).
 */
export function loadExtensionsFromDirectory(extensionsDir: string): LoadedExtensionEntry[] {
  if (!existsSync(extensionsDir)) return []

  let entries: string[]
  try {
    entries = readdirSync(extensionsDir)
  } catch (err) {
    log.warn('Failed to read extensions directory', { extensionsDir, err })
    return []
  }

  const extensions: LoadedExtensionEntry[] = []
  for (const entry of entries) {
    if (!isLoadableExtensionFolder(extensionsDir, entry)) continue

    const dir = join(extensionsDir, entry)
    const manifest = loadExtensionManifest(dir)
    if (!manifest) {
      log.warn(EXTENSION_LOADER_LOG.SKIPPED_INVALID, { extensionId: entry, dir })
      continue
    }
    extensions.push({ id: manifest.id, dir, manifest })
  }

  log.info(EXTENSION_LOADER_LOG.LOADED, {
    extensionsDir,
    count: extensions.length,
    extensionIds: extensions.map((e) => e.id),
  })
  return extensions
}

/**
 * Loads extensions from bundled, project, and user directories merged by id.
 * User extensions overwrite project and bundled; project overwrites bundled.
 */
export function listExtensions(workspacePath?: string): LoadedExtension[] {
  const projectDir = resolveProjectExtensionsDirectory(workspacePath)
  const roots: Array<{ dir: string; source: ExtensionSource }> = [
    { dir: resolveBundledExtensionsDirectory(), source: 'bundled' },
    ...(projectDir ? [{ dir: projectDir, source: 'project' as const }] : []),
    { dir: resolveUserExtensionsDirectory(), source: 'user' },
  ]

  const byId = new Map<string, LoadedExtension>()
  for (const { dir, source } of roots) {
    for (const ext of loadExtensionsFromDirectory(dir)) {
      byId.set(ext.id, { ...ext, source })
    }
  }
  return Array.from(byId.values())
}
