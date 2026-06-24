import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { buildServerPath } from '@main/agent/lsp/language-servers'
import { resolveAppRoot } from '@main/config/app-paths'
import type { McpRuntimeKind } from '@shared/mcp/mcp-runtime-requirements'

export type McpRuntimeAvailability = {
  available: boolean
  resolvedPath: string | null
}

export type McpRuntimeStatus = Record<McpRuntimeKind, McpRuntimeAvailability>

let cachedLoginShellPath: string | null | undefined

function resolveDarwinLoginPath(): string | null {
  if (process.platform !== 'darwin') return null
  try {
    const raw = execFileSync('/usr/libexec/path_helper', ['-s'], {
      encoding: 'utf8',
      timeout: 3000,
    }).trim()
    const quoted = raw.match(/^PATH="([^"]+)";?$/)
    if (quoted?.[1]) return quoted[1]
    const unquoted = raw.match(/^PATH=(.+?);?$/)
    return unquoted?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

/**
 * GUI-launched Electron apps inherit a minimal PATH. Run the user's login shell
 * once to capture the same PATH as an interactive terminal (nvm, uv, Homebrew).
 */
export function resolveLoginShellPath(): string | null {
  if (cachedLoginShellPath !== undefined) return cachedLoginShellPath
  if (process.platform === 'win32') {
    cachedLoginShellPath = null
    return null
  }

  const shell = process.env.SHELL?.trim() || '/bin/zsh'
  try {
    const output = execFileSync(shell, ['-ilc', 'printf %s "$PATH"'], {
      encoding: 'utf8',
      timeout: 8000,
      env: { ...process.env, TERM: 'dumb' },
    }).trim()
    cachedLoginShellPath = output || null
  } catch {
    cachedLoginShellPath = null
  }
  return cachedLoginShellPath
}

/** Reset cached login-shell PATH (tests only). */
export function resetLoginShellPathCache(): void {
  cachedLoginShellPath = undefined
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

function probeCommand(command: string, args: string[], path: string): boolean {
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

export function checkMcpRuntimeStatus(): McpRuntimeStatus {
  const path = buildMcpSpawnPath()
  const npxPath = resolveCommandOnPath('npx', path)
  const uvxPath = resolveCommandOnPath('uvx', path)
  return {
    npx: {
      available: npxPath != null && probeCommand('npx', ['--version'], path),
      resolvedPath: npxPath,
    },
    uvx: {
      available: uvxPath != null && probeCommand('uvx', ['--version'], path),
      resolvedPath: uvxPath,
    },
  }
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
