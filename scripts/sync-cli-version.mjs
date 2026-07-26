#!/usr/bin/env node
/**
 * Keep release-facing package versions identical to the root app version.
 *
 * Syncs:
 * - packages/cli/package.json
 * - packaging/homebrew/teralexi.rb
 * - packaging/homebrew/teralexi-desktop.rb
 * - packaging/scoop/teralexi.json
 * - packaging/chocolatey/teralexi.nuspec
 * - packaging/chocolatey/tools/chocolateyinstall.ps1
 *
 * Usage:
 *   node scripts/sync-cli-version.mjs          # write
 *   node scripts/sync-cli-version.mjs --check  # fail if mismatched
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const checkOnly = process.argv.includes('--check')

const rootPkgPath = join(root, 'package.json')
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'))
const rootVersion = String(rootPkg.version ?? '').trim()

if (!rootVersion) {
  console.error('Root package.json version is missing')
  process.exit(1)
}

/** @type {Array<{ label: string, path: string, read: () => string, write?: (next: string) => string }>} */
const targets = [
  {
    label: 'packages/cli',
    path: join(root, 'packages', 'cli', 'package.json'),
    read() {
      const pkg = JSON.parse(readFileSync(this.path, 'utf8'))
      return String(pkg.version ?? '').trim()
    },
    write(next) {
      const pkg = JSON.parse(readFileSync(this.path, 'utf8'))
      const previous = String(pkg.version ?? '').trim()
      pkg.version = next
      writeFileSync(this.path, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
      return previous
    },
  },
  {
    label: 'packaging/homebrew/teralexi.rb',
    path: join(root, 'packaging', 'homebrew', 'teralexi.rb'),
    read() {
      const text = readFileSync(this.path, 'utf8')
      const match = text.match(/^\s*version\s+"([^"]+)"/m)
      return match?.[1]?.trim() ?? ''
    },
    write(next) {
      const text = readFileSync(this.path, 'utf8')
      const previous = this.read()
      const updated = text.replace(
        /^(\s*version\s+")([^"]+)(")/m,
        `$1${next}$3`,
      )
      writeFileSync(this.path, updated, 'utf8')
      return previous
    },
  },
  {
    label: 'packaging/homebrew/teralexi-desktop.rb',
    path: join(root, 'packaging', 'homebrew', 'teralexi-desktop.rb'),
    read() {
      const text = readFileSync(this.path, 'utf8')
      const match = text.match(/^\s*version\s+"([^"]+)"/m)
      return match?.[1]?.trim() ?? ''
    },
    write(next) {
      const text = readFileSync(this.path, 'utf8')
      const previous = this.read()
      const updated = text.replace(
        /^(\s*version\s+")([^"]+)(")/m,
        `$1${next}$3`,
      )
      writeFileSync(this.path, updated, 'utf8')
      return previous
    },
  },
  {
    label: 'packaging/scoop/teralexi.json',
    path: join(root, 'packaging', 'scoop', 'teralexi.json'),
    read() {
      const pkg = JSON.parse(readFileSync(this.path, 'utf8'))
      return String(pkg.version ?? '').trim()
    },
    write(next) {
      const pkg = JSON.parse(readFileSync(this.path, 'utf8'))
      const previous = String(pkg.version ?? '').trim()
      pkg.version = next
      const arch = pkg.architecture?.['64bit']
      if (arch && typeof arch.url === 'string') {
        arch.url = arch.url.replace(
          /\/v\d+\.\d+\.\d+\//,
          `/v${next}/`,
        )
      }
      writeFileSync(this.path, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
      return previous
    },
  },
  {
    label: 'packaging/chocolatey/teralexi.nuspec',
    path: join(root, 'packaging', 'chocolatey', 'teralexi.nuspec'),
    read() {
      const text = readFileSync(this.path, 'utf8')
      const match = text.match(/<version>([^<]+)<\/version>/)
      return match?.[1]?.trim() ?? ''
    },
    write(next) {
      const text = readFileSync(this.path, 'utf8')
      const previous = this.read()
      const updated = text.replace(
        /(<version>)([^<]+)(<\/version>)/,
        `$1${next}$3`,
      )
      writeFileSync(this.path, updated, 'utf8')
      return previous
    },
  },
  {
    label: 'packaging/chocolatey/tools/chocolateyinstall.ps1',
    path: join(root, 'packaging', 'chocolatey', 'tools', 'chocolateyinstall.ps1'),
    read() {
      const text = readFileSync(this.path, 'utf8')
      const match = text.match(/\$version\s*=\s*'([^']+)'/)
      return match?.[1]?.trim() ?? ''
    },
    write(next) {
      const text = readFileSync(this.path, 'utf8')
      const previous = this.read()
      const updated = text.replace(
        /(\$version\s*=\s*')([^']+)(')/,
        `$1${next}$3`,
      )
      writeFileSync(this.path, updated, 'utf8')
      return previous
    },
  },
]

const mismatches = []
for (const target of targets) {
  const current = target.read()
  if (current !== rootVersion) {
    mismatches.push({ label: target.label, current })
  }
}

if (mismatches.length === 0) {
  console.log(`All package versions already match app: ${rootVersion}`)
  process.exit(0)
}

if (checkOnly) {
  console.error(
    `Version mismatch vs app=${rootVersion}:\n${mismatches
      .map((m) => `  - ${m.label}=${m.current || '(missing)'}`)
      .join('\n')}\nRun: node scripts/sync-cli-version.mjs`,
  )
  process.exit(1)
}

for (const target of targets) {
  const current = target.read()
  if (current === rootVersion) continue
  if (!target.write) {
    console.error(`No writer for ${target.label}`)
    process.exit(1)
  }
  const previous = target.write(rootVersion)
  console.log(`Updated ${target.label} ${previous || '(missing)'} → ${rootVersion}`)
}
