import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { app } from 'electron'
import {
  isPackagedApp,
  resolveAppRoot,
  toOnDiskAppPath,
} from '@main/config/app-paths'

/** True for virtual `app.asar/...` paths (not `app.asar.unpacked/...`). */
export function isAsarArchivePath(filePath: string): boolean {
  return (
    /\.asar([/\\]|$)/i.test(filePath) &&
    !/\.asar\.unpacked([/\\]|$)/i.test(filePath)
  )
}

function uniqueRoots(roots: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const root of roots) {
    const trimmed = root?.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function packagedAsarAppPath(): string | null {
  if (!isPackagedApp()) return null
  try {
    return app.getAppPath()
  } catch {
    return null
  }
}

/**
 * Prefer real on-disk (unpacked) paths; fall back to asar paths that Electron's
 * Node can still read via ELECTRON_RUN_AS_NODE.
 */
export function acceptPlaywrightMcpCliPath(candidate: string): string | null {
  const mapped = toOnDiskAppPath(candidate)
  if (existsSync(mapped)) return mapped

  if (mapped.includes('.asar.unpacked')) {
    const asarTwin = mapped.replace(/\.asar\.unpacked/gi, '.asar')
    if (asarTwin !== mapped && existsSync(asarTwin)) return asarTwin
  }

  if (candidate !== mapped && existsSync(candidate)) return candidate
  return null
}

/**
 * Resolve the bundled `@playwright/mcp` CLI (`cli.js`) from node_modules.
 * Main-process only — must not be imported by the renderer.
 */
export function resolvePlaywrightMcpCliPath(
  appPath?: string | null,
): string | null {
  const roots = uniqueRoots([
    appPath,
    resolveAppRoot(),
    packagedAsarAppPath(),
    process.cwd(),
  ])

  for (const root of roots) {
    const direct = acceptPlaywrightMcpCliPath(
      join(root, 'node_modules', '@playwright', 'mcp', 'cli.js'),
    )
    if (direct) return direct

    try {
      const require = createRequire(join(root, 'package.json'))
      const pkgJson = require.resolve('@playwright/mcp/package.json')
      const cliPath = acceptPlaywrightMcpCliPath(join(dirname(pkgJson), 'cli.js'))
      if (cliPath) return cliPath
    } catch {
      // try next root
    }
  }

  return null
}

export type PlaywrightMcpStdioLaunch = {
  command: string
  args: string[]
  env: Record<string, string>
}

/**
 * Build stdio spawn config for Playwright MCP.
 *
 * Packaged Electron apps must not rely on system `node` (often missing from
 * GUI PATH) or on reading `app.asar` with system Node. Use the app binary with
 * `ELECTRON_RUN_AS_NODE` instead.
 */
export function buildPlaywrightMcpStdioLaunch(
  cliPath: string,
  extraArgs: string[] = [],
): PlaywrightMcpStdioLaunch {
  const args = [cliPath, ...extraArgs]
  // @ai-sdk/mcp only inherits a small env allowlist; TMPDIR is not included.
  const runtimeEnv: Record<string, string> = {
    TMPDIR: process.env.TMPDIR?.trim() || tmpdir(),
  }

  if (isPackagedApp() || isAsarArchivePath(cliPath)) {
    return {
      command: process.execPath,
      args,
      env: {
        ...runtimeEnv,
        ELECTRON_RUN_AS_NODE: '1',
      },
    }
  }
  return {
    command: 'node',
    args,
    env: runtimeEnv,
  }
}
