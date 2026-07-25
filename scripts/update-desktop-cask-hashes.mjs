#!/usr/bin/env node
/**
 * Refresh packaging/homebrew/teralexi-desktop.rb with sha256 of mac desktop zips.
 *
 * Intended for the release pipeline (after `npm run release:mac`), hashing the
 * same archives that are uploaded to S3 (`desktop/releases/stable`).
 *
 * Usage:
 *   node scripts/update-desktop-cask-hashes.mjs
 *   node scripts/update-desktop-cask-hashes.mjs --build-dir build
 *
 * Env:
 *   TERALEXI_DESKTOP_API  base URL for cask download links
 *                         (default https://api.teralexi.com/desktop/releases/stable)
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const desktopApi = (
  process.env.TERALEXI_DESKTOP_API ||
  'https://api.teralexi.com/desktop/releases/stable'
).replace(/\/$/, '')

const version = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
).version

function argValue(flag) {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const buildDir = join(root, argValue('--build-dir') || 'build')

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function findZip(predicate) {
  if (!existsSync(buildDir)) return null
  const names = readdirSync(buildDir).filter(
    (n) => n.endsWith('.zip') && !n.endsWith('.blockmap') && predicate(n),
  )
  // Prefer versioned electron-builder names for this release.
  const preferred = names.find((n) => n.includes(version))
  return preferred ? join(buildDir, preferred) : names[0] ? join(buildDir, names[0]) : null
}

const arm64Path = findZip(
  (n) => /Teralexi/i.test(n) && /arm64/i.test(n) && /-mac\.zip$/i.test(n),
)
const x64Path = findZip(
  (n) =>
    /Teralexi/i.test(n) &&
    !/arm64/i.test(n) &&
    /-mac\.zip$/i.test(n),
)

if (!arm64Path || !x64Path) {
  console.error(
    `[desktop-cask] Missing mac zip(s) under ${buildDir}.\n` +
      `  arm64: ${arm64Path || '(missing)'}\n` +
      `  x64:   ${x64Path || '(missing)'}\n` +
      `Run on the mac release job after electron-builder (npm run release:mac).`,
  )
  process.exit(1)
}

const hashes = {
  arm64: sha256File(arm64Path),
  x64: sha256File(x64Path),
}

console.log(`${arm64Path}  ${hashes.arm64}`)
console.log(`${x64Path}  ${hashes.x64}`)

const arm64Name = `Teralexi-${version}-arm64-mac.zip`
const x64Name = `Teralexi-${version}-mac.zip`

const cask = `# typed: false
# Homebrew Cask for the Teralexi desktop app.
# Copy into Naughty-Otters/homebrew-tap Casks/teralexi-desktop.rb after each release.
# sha256 values are written by the release pipeline:
#   node scripts/update-desktop-cask-hashes.mjs
#
#   brew tap Naughty-Otters/tap
#   brew install --cask teralexi-desktop
#
# CLI formula remains Formula/teralexi.rb (brew install teralexi).

cask "teralexi-desktop" do
  version "${version}"
  desc "Local-first AI agent desktop app"
  homepage "https://www.teralexi.com/"

  livecheck do
    url "${desktopApi}"
    regex(/Teralexi[._-]v?(\\d+(?:\\.\\d+)+)(?:-arm64)?-mac\\.zip/i)
  end

  on_arm do
    url "${desktopApi}/${arm64Name}"
    sha256 "${hashes.arm64}"
  end
  on_intel do
    url "${desktopApi}/${x64Name}"
    sha256 "${hashes.x64}"
  end

  app "Teralexi.app"

  zap trash: [
    "~/Library/Application Support/Teralexi",
    "~/Library/Preferences/app.teralexi.desktop.plist",
    "~/Library/Saved Application State/app.teralexi.desktop.savedState",
    "~/.teralexi",
  ]
end
`

const outPath = join(root, 'packaging', 'homebrew', 'teralexi-desktop.rb')
writeFileSync(outPath, cask, 'utf8')

const checksumPath = join(buildDir, 'desktop-cask-checksums.json')
writeFileSync(
  checksumPath,
  `${JSON.stringify(
    {
      version,
      generatedAt: new Date().toISOString(),
      files: {
        [arm64Name]: hashes.arm64,
        [x64Name]: hashes.x64,
      },
      source: { arm64: arm64Path, x64: x64Path },
    },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log(`[desktop-cask] Updated ${outPath}`)
console.log(`[desktop-cask] Wrote ${checksumPath}`)
