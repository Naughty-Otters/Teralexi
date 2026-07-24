#!/usr/bin/env node
/**
 * Keep packages/cli version identical to the root app version.
 * Usage: node scripts/sync-cli-version.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const rootPkgPath = join(root, 'package.json')
const cliPkgPath = join(root, 'packages', 'cli', 'package.json')
const checkOnly = process.argv.includes('--check')

const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'))
const cliPkg = JSON.parse(readFileSync(cliPkgPath, 'utf8'))
const rootVersion = String(rootPkg.version ?? '').trim()
const cliVersion = String(cliPkg.version ?? '').trim()

if (!rootVersion) {
  console.error('Root package.json version is missing')
  process.exit(1)
}

if (cliVersion === rootVersion) {
  console.log(`CLI version already matches app: ${rootVersion}`)
  process.exit(0)
}

if (checkOnly) {
  console.error(
    `CLI version mismatch: packages/cli=${cliVersion} app=${rootVersion}. Run: node scripts/sync-cli-version.mjs`,
  )
  process.exit(1)
}

cliPkg.version = rootVersion
writeFileSync(cliPkgPath, `${JSON.stringify(cliPkg, null, 2)}\n`, 'utf8')
console.log(`Updated packages/cli version ${cliVersion} → ${rootVersion}`)
