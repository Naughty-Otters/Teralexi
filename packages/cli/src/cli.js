#!/usr/bin/env node
/**
 * Teralexi CLI — headless companion to the desktop app.
 *
 * Phase 1: install/distribution surface (version, help, doctor, open,
 * skill/extension install). Agent `run` lands once the Electron agent core
 * is extractable.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, platform, arch, release } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import {
  ensureHomeDirs,
  installExtension,
  installSkill,
  listInstalled,
  removeInstalled,
} from './install.js'

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
const HOME = join(homedir(), '.teralexi')

function printHelp() {
  console.log(`Teralexi CLI v${VERSION}

Usage:
  teralexi [command] [options]

Commands:
  doctor              Check local install (~/.teralexi, Node, desktop)
  open                Launch the Teralexi desktop app if installed
  skill install <src> Install a skill (GitHub owner/repo, URL, or path)
  skill list          List installed skills
  skill remove <id>   Remove an installed skill
  extension install <src>
  extension list
  extension remove <id>
  run <prompt>        Run a headless agent turn (coming soon)
  version             Print version
  help                Show this help

Skill / extension options:
  -p, --project       Install under ./.teralexi/ instead of ~/.teralexi/
  --id <id>           Override destination folder id

Sources:
  owner/repo
  https://github.com/owner/repo
  https://github.com/owner/repo/tree/main/skills/my-skill
  ./path/to/skill-or-extension

Ecosystem skill markers accepted:
  skill.md, SKILL.md, skills.md, AGENT.md, AGENTS.md

Examples:
  npx teralexi-ai skill install vercel-labs/agent-skills
  npx teralexi-ai skill install owner/repo --id my-skill -p
  npx teralexi-ai extension install ./extensions/my-guard

Install CLI:
  curl -fsSL https://www.teralexi.com/install | bash
  npm i -g teralexi-ai@latest

Desktop app:
  https://www.teralexi.com/
`)
}

function ensureHome() {
  ensureHomeDirs()
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

function parseFlags(args) {
  const out = { project: false, id: undefined, rest: [] }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-p' || a === '--project') out.project = true
    else if (a === '--id') out.id = args[++i]
    else out.rest.push(a)
  }
  return out
}

function cmdSkill(args) {
  const sub = args[0]
  const flags = parseFlags(args.slice(1))
  if (sub === 'install') {
    const source = flags.rest[0]
    if (!source) {
      console.error('Usage: teralexi skill install <source> [--id <id>] [-p]')
      return 1
    }
    const result = installSkill(source, { id: flags.id, project: flags.project })
    if (!result.ok) {
      console.error(result.error)
      return 1
    }
    console.log(`Installed skill "${result.id}" → ${result.path}`)
    return 0
  }
  if (sub === 'list' || sub === 'ls') {
    const ids = listInstalled('skills', flags.project)
    if (ids.length === 0) {
      console.log('(no skills installed)')
      return 0
    }
    console.log(ids.join('\n'))
    return 0
  }
  if (sub === 'remove' || sub === 'rm' || sub === 'uninstall') {
    const id = flags.rest[0]
    if (!id) {
      console.error('Usage: teralexi skill remove <id> [-p]')
      return 1
    }
    const result = removeInstalled('skills', id, flags.project)
    if (!result.ok) {
      console.error(result.error)
      return 1
    }
    console.log(`Removed skill "${result.id}"`)
    return 0
  }
  console.error(`Unknown skill command: ${sub || '(missing)'}`)
  console.error('Usage: teralexi skill <install|list|remove> …')
  return 1
}

function cmdExtension(args) {
  const sub = args[0]
  const flags = parseFlags(args.slice(1))
  if (sub === 'install') {
    const source = flags.rest[0]
    if (!source) {
      console.error(
        'Usage: teralexi extension install <source> [--id <id>] [-p]',
      )
      return 1
    }
    const result = installExtension(source, {
      id: flags.id,
      project: flags.project,
    })
    if (!result.ok) {
      console.error(result.error)
      return 1
    }
    console.log(`Installed extension "${result.id}" → ${result.path}`)
    return 0
  }
  if (sub === 'list' || sub === 'ls') {
    const ids = listInstalled('extensions', flags.project)
    if (ids.length === 0) {
      console.log('(no extensions installed)')
      return 0
    }
    console.log(ids.join('\n'))
    return 0
  }
  if (sub === 'remove' || sub === 'rm' || sub === 'uninstall') {
    const id = flags.rest[0]
    if (!id) {
      console.error('Usage: teralexi extension remove <id> [-p]')
      return 1
    }
    const result = removeInstalled('extensions', id, flags.project)
    if (!result.ok) {
      console.error(result.error)
      return 1
    }
    console.log(`Removed extension "${result.id}"`)
    return 0
  }
  console.error(`Unknown extension command: ${sub || '(missing)'}`)
  console.error('Usage: teralexi extension <install|list|remove> …')
  return 1
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
  if (cmd === 'skill' || cmd === 'skills') return cmdSkill(args.slice(1))
  if (cmd === 'extension' || cmd === 'extensions' || cmd === 'ext') {
    return cmdExtension(args.slice(1))
  }

  console.error(`Unknown command: ${cmd}`)
  printHelp()
  return 1
}

process.exitCode = main(process.argv)
