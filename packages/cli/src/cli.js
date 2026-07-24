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
import { spawn } from 'node:child_process'
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

function findDesktopApp() {
  const p = platform()
  if (p === 'darwin') {
    const candidates = [
      '/Applications/Teralexi.app',
      join(homedir(), 'Applications', 'Teralexi.app'),
    ]
    return candidates.find((c) => existsSync(c)) ?? null
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
  const configProps = join(HOME, 'config', 'config.properties')
  lines.push(
    `Config      ${existsSync(configProps) ? configProps : 'not created yet'}`,
  )
  console.log(lines.join('\n'))
  return 0
}

function cmdOpen() {
  const desktop = findDesktopApp()
  if (!desktop) {
    console.error(
      'Teralexi desktop app not found. Download from https://www.teralexi.com/',
    )
    return 1
  }
  const p = platform()
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
