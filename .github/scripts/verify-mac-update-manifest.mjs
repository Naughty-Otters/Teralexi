#!/usr/bin/env node
/**
 * Verify the macOS auto-update manifest (latest-mac.yml) covers BOTH CPU
 * architectures before publishing.
 *
 * electron-updater (MacUpdater) reads a single `latest-mac.yml` and selects the
 * zip that matches the running Mac's arch (Intel x64 vs Apple Silicon arm64).
 * If a release only lists one arch, users on the missing arch either get no
 * update or download the wrong binary. This check fails the release early.
 *
 * Usage: node .github/scripts/verify-mac-update-manifest.mjs [buildDir]
 * Exit: 0 = both arches present, 1 = missing arch / manifest problem.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const buildDir = process.argv[2] || 'build'
const manifestPath = join(buildDir, 'latest-mac.yml')

if (!existsSync(manifestPath)) {
  console.error(
    `[verify-mac-update] ${manifestPath} not found — expected electron-builder to emit it for a mac release.`,
  )
  process.exit(1)
}

const raw = readFileSync(manifestPath, 'utf-8')

// latest-mac.yml is simple, indentation-based YAML. Pull every `url:` value
// under the `files:` list without taking on a YAML dependency.
const urls = raw
  .split('\n')
  .map((line) => line.match(/^\s*-?\s*url:\s*(.+?)\s*$/i)?.[1])
  .filter(Boolean)
  .map((u) => u.replace(/^['"]|['"]$/g, ''))

const zips = urls.filter((u) => /\.zip$/i.test(u))
const arm64Zips = zips.filter((u) => /arm64/i.test(u))
// x64 zips are the ones with no explicit arm64 marker (electron-builder omits
// the arch suffix for the default x64 artifact name).
const x64Zips = zips.filter((u) => !/arm64/i.test(u))

console.log(`[verify-mac-update] manifest: ${manifestPath}`)
console.log(`[verify-mac-update] zip files listed: ${zips.join(', ') || '(none)'}`)

const problems = []
if (x64Zips.length === 0) {
  problems.push('no Intel (x64) zip found in latest-mac.yml')
}
if (arm64Zips.length === 0) {
  problems.push('no Apple Silicon (arm64) zip found in latest-mac.yml')
}

if (problems.length > 0) {
  console.error(
    `[verify-mac-update] FAIL — the update manifest does not cover both CPU types:\n` +
      problems.map((p) => `  - ${p}`).join('\n') +
      `\n  Build both arches in a single electron-builder invocation ` +
      `(build.json mac.target arch: ["x64","arm64"]).`,
  )
  process.exit(1)
}

console.log(
  `[verify-mac-update] OK — both Intel (x64) and Apple Silicon (arm64) zips are present; ` +
    `electron-updater will serve the correct file per arch.`,
)
process.exit(0)
