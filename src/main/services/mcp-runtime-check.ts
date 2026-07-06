import { execFile, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { buildServerPath } from '@main/agent/lsp/language-servers'
import { resolveAppRoot } from '@main/config/app-paths'
import type { McpRuntimeKind } from '@shared/mcp/mcp-runtime-requirements'

export type McpRuntimeAvailability = {
  available: boolean
  resolvedPath: string | null
}

export type McpRuntimeStatus = Record<McpRuntimeKind, McpRuntimeAvailability>

const execFileAsync = promisify(execFile)
const MCP_RUNTIME_STATUS_TTL_MS = 5 * 60 * 1000

let cachedLoginShellPath: string | null | undefined
let cachedDarwinPath: string | null | undefined
let cachedRuntimeStatus: McpRuntimeStatus | null = null
let cachedRuntimeStatusAt = 0
let runtimeStatusRefresh: Promise<McpRuntimeStatus> | null = null
let loginShellPrewarm: Promise<string | null> | null = null
let darwinPathPrewarm: Promise<string | null> | null = null

async function resolveDarwinLoginPathAsync(): Promise<string | null> {
  if (cachedDarwinPath !== undefined) return cachedDarwinPath
  if (process.platform !== 'darwin') {
    cachedDarwinPath = null
    return null
  }
  try {
    const { stdout } = await execFileAsync('/usr/libexec/path_helper', ['-s'], {
      encoding: 'utf8',
      timeout: 3000,
    })
    const raw = stdout.trim()
    const quoted = raw.match(/^PATH="([^"]+)";?$/)
    if (quoted?.[1]) {
      cachedDarwinPath = quoted[1]
      return cachedDarwinPath
    }
    const unquoted = raw.match(/^PATH=(.+?);?$/)
    cachedDarwinPath = unquoted?.[1]?.trim() ?? null
    return cachedDarwinPath
  } catch {
    cachedDarwinPath = null
    return null
  }
}

/**
 * GUI-launched Electron apps inherit a minimal PATH. Capture the user's login
 * shell PATH asynchronously so settings UI never blocks on a shell spawn.
 */
export async function prewarmLoginShellPath(): Promise<string | null> {
  if (cachedLoginShellPath !== undefined) return cachedLoginShellPath
  if (loginShellPrewarm) return loginShellPrewarm

  loginShellPrewarm = (async () => {
    if (process.platform === 'win32') {
      cachedLoginShellPath = null
      return null
    }

    const shell = process.env.SHELL?.trim() || '/bin/zsh'
    try {
      const { stdout } = await execFileAsync(
        shell,
        ['-ilc', 'printf %s "$PATH"'],
        {
          encoding: 'utf8',
          timeout: 8000,
          env: { ...process.env, TERM: 'dumb' },
        },
      )
      cachedLoginShellPath = stdout.trim() || null
    } catch {
      cachedLoginShellPath = null
    }
    return cachedLoginShellPath
  })().finally(() => {
    loginShellPrewarm = null
  })

  return loginShellPrewarm
}

/**
 * Returns cached login-shell PATH only. Never spawns a shell synchronously.
 */
export function resolveLoginShellPath(): string | null {
  if (cachedLoginShellPath !== undefined) return cachedLoginShellPath
  return null
}

/** Reset cached login-shell PATH (tests only). */
export function resetLoginShellPathCache(): void {
  cachedLoginShellPath = undefined
  loginShellPrewarm = null
}

function resolveDarwinLoginPath(): string | null {
  if (cachedDarwinPath !== undefined) return cachedDarwinPath
  return null
}

/** Reset cached Darwin PATH (tests only). */
export function resetDarwinPathCache(): void {
  cachedDarwinPath = undefined
  darwinPathPrewarm = null
}

export function resetMcpRuntimeStatusCache(): void {
  cachedRuntimeStatus = null
  cachedRuntimeStatusAt = 0
  runtimeStatusRefresh = null
}

/** Common user-local install dirs that macOS GUI apps usually miss. */
export function resolveCommonUserBinPaths(): string[] {
  const home = homedir()
  const candidates =
    process.platform === 'win32'
      ? [
          join(home, '.local', 'bin'),
          join(home, 'AppData', 'Local', 'Programs', 'uv'),
          join(home, 'AppData', 'Roaming', 'npm'),
        ]
      : [
          join(home, '.local', 'bin'),
          join(home, '.pyenv', 'shims'),
          join(home, '.cargo', 'bin'),
          join(home, '.volta', 'bin'),
          join(home, '.fnm', 'current', 'bin'),
          join(home, '.asdf', 'shims'),
          join(home, '.npm-global', 'bin'),
          join(home, 'bin'),
        ]

  return candidates.filter((dir) => existsSync(dir))
}

function mergePathSegments(...segments: readonly string[]): string {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const segment of segments) {
    for (const dir of segment.split(delimiter)) {
      const trimmed = dir.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      ordered.push(trimmed)
    }
  }
  return ordered.join(delimiter)
}

export function buildMcpSpawnPath(): string {
  return mergePathSegments(
    buildServerPath(resolveAppRoot()),
    resolveCommonUserBinPaths().join(delimiter),
    resolveLoginShellPath() ?? '',
    resolveDarwinLoginPath() ?? '',
    process.env.PATH ?? '',
  )
}

function binCandidates(command: string): string[] {
  if (process.platform === 'win32') {
    return [`${command}.cmd`, command, `${command}.exe`]
  }
  return [command]
}

export function resolveCommandOnPath(
  command: string,
  path: string,
): string | null {
  const trimmed = command.trim()
  if (!trimmed) return null
  if (
    trimmed.includes('/') ||
    (process.platform === 'win32' && trimmed.includes('\\'))
  ) {
    return existsSync(trimmed) ? trimmed : null
  }
  for (const dir of path.split(delimiter)) {
    if (!dir) continue
    for (const name of binCandidates(trimmed)) {
      const fullPath = join(dir, name)
      if (existsSync(fullPath)) return fullPath
    }
  }
  return null
}

function computeMcpRuntimeStatus(): McpRuntimeStatus {
  const path = buildMcpSpawnPath()
  const npxPath = resolveCommandOnPath('npx', path)
  const uvxPath = resolveCommandOnPath('uvx', path)
  return {
    npx: {
      available: npxPath != null,
      resolvedPath: npxPath,
    },
    uvx: {
      available: uvxPath != null,
      resolvedPath: uvxPath,
    },
  }
}

/** Fast, cached runtime lookup for settings UI (PATH resolution only). */
export function checkMcpRuntimeStatus(): McpRuntimeStatus {
  const now = Date.now()
  if (
    cachedRuntimeStatus &&
    now - cachedRuntimeStatusAt < MCP_RUNTIME_STATUS_TTL_MS
  ) {
    return cachedRuntimeStatus
  }

  const status = computeMcpRuntimeStatus()
  cachedRuntimeStatus = status
  cachedRuntimeStatusAt = now
  return status
}

async function refreshMcpRuntimeStatusInBackground(): Promise<McpRuntimeStatus> {
  if (runtimeStatusRefresh) return runtimeStatusRefresh

  runtimeStatusRefresh = (async () => {
    await Promise.all([prewarmLoginShellPath(), prewarmDarwinLoginPath()])
    const status = computeMcpRuntimeStatus()
    cachedRuntimeStatus = status
    cachedRuntimeStatusAt = Date.now()
    return status
  })().finally(() => {
    runtimeStatusRefresh = null
  })

  return runtimeStatusRefresh
}

async function prewarmDarwinLoginPath(): Promise<string | null> {
  if (cachedDarwinPath !== undefined) return cachedDarwinPath
  if (darwinPathPrewarm) return darwinPathPrewarm

  darwinPathPrewarm = resolveDarwinLoginPathAsync().finally(() => {
    darwinPathPrewarm = null
  })
  return darwinPathPrewarm
}

/** Warm PATH caches in the background; safe to call at app startup. */
export function prewarmMcpRuntimeEnvironment(): void {
  void Promise.all([
    prewarmLoginShellPath(),
    prewarmDarwinLoginPath(),
    refreshMcpRuntimeStatusInBackground(),
  ])
}

/** Ensure full PATH is ready before spawning stdio MCP servers. */
export async function ensureMcpSpawnPathReady(): Promise<void> {
  await Promise.all([prewarmLoginShellPath(), prewarmDarwinLoginPath()])
}

export function buildStdioMcpEnv(
  serverEnv: Record<string, string>,
): Record<string, string> {
  return {
    ...serverEnv,
    PATH: buildMcpSpawnPath(),
  }
}

export function resolveStdioMcpCommand(command: string): {
  command: string
  path: string
} {
  const path = buildMcpSpawnPath()
  return {
    path,
    command: resolveCommandOnPath(command, path) ?? command.trim(),
  }
}

/** @deprecated Used only in tests that verify executable probing behavior. */
export function probeCommandForTests(
  command: string,
  args: string[],
  path: string,
): boolean {
  const resolved = resolveCommandOnPath(command, path)
  if (!resolved) return false
  try {
    execFileSync(resolved, args, {
      env: { ...process.env, PATH: path },
      timeout: 5000,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}
