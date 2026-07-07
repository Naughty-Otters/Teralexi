#!/usr/bin/env node
/**
 * Staple a notarized macOS .app (or .dmg) with extended retries.
 *
 * Use when electron-builder failed at stapling with code 68 (CloudKit timeout)
 * but Apple notarization already succeeded.
 *
 * Usage:
 *   node scripts/macos-staple-with-retry.cjs build/mac/Teralexi.app
 */
const { existsSync } = require('node:fs')
const { resolve } = require('node:path')
const { stapleMacAppWithRetry } = require('./macos-notarize-with-retry.cjs')

async function main() {
  const target = process.argv[2]
  if (!target) {
    console.error('Usage: node scripts/macos-staple-with-retry.cjs <path-to-.app-or-.dmg>')
    process.exit(2)
  }

  const appPath = resolve(process.cwd(), target)
  if (!existsSync(appPath)) {
    console.error(`Path does not exist: ${appPath}`)
    process.exit(1)
  }

  await stapleMacAppWithRetry(appPath)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
