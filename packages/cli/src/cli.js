#!/usr/bin/env node
/**
 * Teralexi CLI — headless companion to the desktop app.
 *
 * Phase 1: install/distribution surface (version, help, doctor, open).
 * Agent `run` is wired next once the Electron agent core is extractable.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, platform, arch, release } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function readPackageVersion() {
  try {
    const pkg = require(join(__dirname, '..', 'package.json'))
    return String(pkg.version || '0.0.0')
  } catch {
    try {
      const meta = JSON.parse(
        readFileSync(join(__dirname, 'version.json'), 'utf8'),
      )
      return String(meta.version || '0.0.0')
    } catch {
      return '0.0.0'
    }
  }
}

const VERSION = readPackageVersion()
const APP = 'teralexi'
const HOME = join(homedir(), '.teralexi')

function printHelp() {
  console.log(`Teralexi CLI v${VERSION}

Usage:
  teralexi [command] [options]

Commands:
  doctor              Check local install (~/.teralexi, Node, desktop)
  open                Launch the Teralexi desktop app if installed
  run <prompt>        Run a headless agent turn (coming soon)
  version             Print version
  help                Show this help

Global options:
  -h, --help          Show help
  -v, --version       Print version

Install:
  curl -fsSL https://www.teralexi.com/install | bash
  npm i -g teralexi-ai@latest

Desktop app:
  https://www.teralexi.com/
`)
}

function ensureHome() {
  for (const dir of [
    HOME,
    join(HOME, 'config'),
    join(HOME, 'skills'),
    join(HOME, 'workspace'),
  ]) {
    mkdirSync(dir, { recursive: true })
  }
}

const DESKTOP_BUNDLE_ID = 'app.teralexi.desktop'
const DESKTOP_DOWNLOAD = 'https://www.teralexi.com/'

function resolveFromEnv() {
  const fromEnv = process.env.TERALEXI_APP?.trim()
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  return null
}

/** macOS: Launch Services path for our bundle id (covers non-/Applications installs). */
function findMacAppByBundleId() {
  const r = spawnSync(
    'mdfind',
    [`kMDItemCFBundleIdentifier == '${DESKTOP_BUNDLE_ID}'`],
    { encoding: 'utf8' },
  )
  if (r.status !== 0 || !r.stdout) return null
  const hit = r.stdout
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.endsWith('.app') && existsSync(l))
  return hit ?? null
}

function findDesktopApp() {
  const fromEnv = resolveFromEnv()
  if (fromEnv) return fromEnv

  const p = platform()
  if (p === 'darwin') {
    const candidates = [
      '/Applications/Teralexi.app',
      join(homedir(), 'Applications', 'Teralexi.app'),
    ]
    const known = candidates.find((c) => existsSync(c))
    if (known) return known
    return findMacAppByBundleId()
  }
  if (p === 'win32') {
    const local = process.env.LOCALAPPDATA
    if (local) {
      const exe = join(local, 'Programs', 'Teralexi', 'Teralexi.exe')
      if (existsSync(exe)) return exe
    }
    return null
  }
  // Linux AppImage / desktop entry — best-effort
  const appImage = join(homedir(), 'Applications', 'Teralexi.AppImage')
  if (existsSync(appImage)) return appImage
  return null
}

function cmdDoctor() {
  ensureHome()
  const lines = [
    `Teralexi CLI ${VERSION}`,
    `Node        ${process.version}`,
    `Platform    ${platform()}/${arch()} (${release()})`,
    `Home        ${HOME}`,
  ]
  const desktop = findDesktopApp()
  lines.push(`Desktop     ${desktop ? desktop : 'not found (optional)'}`)
  if (!desktop && process.env.TERALEXI_APP) {
    lines.push(`             TERALEXI_APP=${process.env.TERALEXI_APP} (path missing)`)
  }
  const configProps = join(HOME, 'config', 'config.properties')
  lines.push(
    `Config      ${existsSync(configProps) ? configProps : 'not created yet'}`,
  )
  console.log(lines.join('\n'))
  return 0
}

function cmdOpen() {
  const desktop = findDesktopApp()
  const p = platform()

  // Prefer launching by bundle id on macOS — works even when path lookup fails.
  if (p === 'darwin' && !desktop) {
    const byId = spawnSync('open', ['-b', DESKTOP_BUNDLE_ID], {
      encoding: 'utf8',
    })
    if (byId.status === 0) {
      console.log(`Launching ${DESKTOP_BUNDLE_ID}`)
      return 0
    }
  }

  if (!desktop) {
    console.error(`Teralexi desktop app not found.

The CLI (teralexi-ai) does not include the desktop app.
Install the desktop build, then retry:

  1. Download: ${DESKTOP_DOWNLOAD}
  2. Move Teralexi.app to /Applications (macOS)
  3. Or point the CLI at a local build:
       export TERALEXI_APP=/path/to/Teralexi.app
       teralexi open

Check: teralexi doctor`)
    return 1
  }

  if (p === 'darwin') {
    spawn('open', [desktop], { detached: true, stdio: 'ignore' }).unref()
  } else if (p === 'win32') {
    spawn(desktop, [], { detached: true, stdio: 'ignore' }).unref()
  } else {
    spawn(desktop, [], { detached: true, stdio: 'ignore' }).unref()
  }
  console.log(`Launching ${desktop}`)
  return 0
}

function cmdRun(args) {
  const prompt = args.join(' ').trim()
  if (!prompt) {
    console.error('Usage: teralexi run <prompt>')
    return 1
  }
  ensureHome()
  // Placeholder until agent core is extracted from Electron main.
  const marker = join(HOME, 'cli-run-requested.json')
  writeFileSync(
    marker,
    JSON.stringify(
      {
        prompt,
        at: new Date().toISOString(),
        version: VERSION,
        status: 'not_implemented',
      },
      null,
      2,
    ) + '\n',
    'utf8',
  )
  console.error(`teralexi run is not wired yet (wrote ${marker}).
Headless agent turns land in a follow-up release.
For now use the desktop app: teralexi open
Or: https://www.teralexi.com/`)
  return 2
}

function main(argv) {
  const args = argv.slice(2)
  const cmd = args[0]

  if (
    args.length === 0 ||
    cmd === 'help' ||
    cmd === '-h' ||
    cmd === '--help'
  ) {
    printHelp()
    return 0
  }
  if (cmd === 'version' || cmd === '-v' || cmd === '--version') {
    console.log(VERSION)
    return 0
  }
  if (cmd === 'doctor') return cmdDoctor()
  if (cmd === 'open') return cmdOpen()
  if (cmd === 'run') return cmdRun(args.slice(1))

  console.error(`Unknown command: ${cmd}`)
  printHelp()
  return 1
}

process.exitCode = main(process.argv)
