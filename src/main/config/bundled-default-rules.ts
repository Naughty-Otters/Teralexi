import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '@main/logger'
import { joinAppResourcePath } from './app-paths'

const log = createLogger('config.bundled-default-rules')

const RULE_FILE_RE = /\.(?:md|mdc)$/i

export function resolveBundledDefaultRulesDirectory(): string {
  return joinAppResourcePath('.openfde', 'rules')
}

/** Copy shipped default rules into ~/.openfde/rules when a file is not present yet. */
export function seedBundledDefaultRulesIfMissing(userRulesDir: string): void {
  const bundledRulesDir = resolveBundledDefaultRulesDirectory()
  if (!existsSync(bundledRulesDir)) {
    log.debug('no bundled default rules directory — skipping seed', {
      bundledRulesDir,
    })
    return
  }

  mkdirSync(userRulesDir, { recursive: true })

  let entries: string[]
  try {
    entries = readdirSync(bundledRulesDir)
  } catch (error) {
    log.warn('failed to read bundled default rules directory', {
      bundledRulesDir,
      error,
    })
    return
  }

  let seeded = 0
  for (const entry of entries) {
    if (entry.startsWith('.') || !RULE_FILE_RE.test(entry)) continue

    const sourcePath = join(bundledRulesDir, entry)
    const destPath = join(userRulesDir, entry)
    if (existsSync(destPath)) continue

    try {
      copyFileSync(sourcePath, destPath)
      seeded += 1
    } catch (error) {
      log.warn('failed to seed bundled default rule', {
        sourcePath,
        destPath,
        error,
      })
    }
  }

  if (seeded > 0) {
    log.info('seeded bundled default project rules', {
      userRulesDir,
      seeded,
    })
  }
}
