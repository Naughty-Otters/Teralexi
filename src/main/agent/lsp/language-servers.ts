import { existsSync } from 'node:fs'
import { delimiter, dirname, extname, join } from 'node:path'

/**
 * Definition of a language server we know how to launch over stdio.
 *
 * `extensions` maps a file extension (with leading dot, lowercase) to the LSP
 * `languageId` to send in textDocument/didOpen.
 */
export type LanguageServerDef = {
  /** Stable id, also used as the diagnostics cache key per workspace. */
  id: string
  /** Executable to spawn (resolved from node_modules/.bin or PATH). */
  command: string
  /** Marker files; presence in the workspace root means this server is relevant. */
  markers?: string[]
  /** Arguments — should put the server in stdio mode. */
  args: string[]
  /** extension (lowercase, with dot) → LSP languageId */
  extensions: Record<string, string>
}

/**
 * Built-in language servers, tried in order. Each is optional: if its binary is
 * not installed, the manager skips it gracefully (no diagnostics, no error).
 *
 * Install hints:
 *  - typescript-language-server: `npm i -g typescript typescript-language-server`
 *  - pyright:                    `npm i -g pyright`
 *  - gopls:                      `go install golang.org/x/tools/gopls@latest`
 *  - rust-analyzer:              `rustup component add rust-analyzer`
 */
export const LANGUAGE_SERVERS: LanguageServerDef[] = [
  {
    id: 'typescript',
    command: 'typescript-language-server',
    markers: ['tsconfig.json', 'jsconfig.json', 'package.json'],
    args: ['--stdio'],
    extensions: {
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.mts': 'typescript',
      '.cts': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascriptreact',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
    },
  },
  {
    id: 'pyright',
    command: 'pyright-langserver',
    markers: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile'],
    args: ['--stdio'],
    extensions: {
      '.py': 'python',
      '.pyi': 'python',
    },
  },
  {
    id: 'gopls',
    command: 'gopls',
    markers: ['go.mod'],
    args: [],
    extensions: {
      '.go': 'go',
    },
  },
  {
    id: 'rust-analyzer',
    command: 'rust-analyzer',
    markers: ['Cargo.toml'],
    args: [],
    extensions: {
      '.rs': 'rust',
    },
  },
]

/** Env var carrying the app's own `node_modules/.bin` (set at main startup). */
export const OPENFDE_LSP_BUNDLED_BIN_ENV = 'OPENFDE_LSP_BUNDLED_BIN' as const

/** The app-bundled `node_modules/.bin` dir, if known. */
export function bundledBinDir(): string | null {
  return process.env[OPENFDE_LSP_BUNDLED_BIN_ENV]?.trim() || null
}

/**
 * Locate the app's own `node_modules/.bin` (where the bundled language servers
 * live) from candidate roots and publish it via env so the LSP client resolves
 * it in any process/bundle. Call once at main startup with `app.getAppPath()`
 * and `process.cwd()` as candidates.
 */
export function initBundledLspBin(appRootCandidates: string[]): string | null {
  for (const root of appRootCandidates) {
    if (!root?.trim()) continue
    const dir = join(root, 'node_modules', '.bin')
    if (existsSync(dir)) {
      process.env[OPENFDE_LSP_BUNDLED_BIN_ENV] = dir
      return dir
    }
  }
  return null
}

function binFileName(command: string): string {
  return process.platform === 'win32' ? `${command}.cmd` : command
}

/**
 * Resolve the executable to spawn for a server. Resolution order:
 *  1. project-local — `<workspace>/node_modules/.bin/<cmd>` (matches the
 *     project's own server/TypeScript version when present);
 *  2. app-bundled — the app ships `typescript-language-server` + `typescript`
 *     and `pyright`, so any workspace gets code intelligence out of the box;
 *  3. bare command — resolved via PATH (global install).
 *
 * Neither (1) nor PATH is guaranteed in the Electron process, so (2) is the
 * reliable default.
 */
export function resolveServerCommand(
  def: LanguageServerDef,
  workspaceRoot: string,
): string {
  const binName = binFileName(def.command)

  const local = join(workspaceRoot, 'node_modules', '.bin', binName)
  if (existsSync(local)) return local

  const bundledDir = bundledBinDir()
  if (bundledDir) {
    const bundled = join(bundledDir, binName)
    if (existsSync(bundled)) return bundled
  }

  return def.command
}

/**
 * Build a PATH for the spawned server that includes the workspace's
 * `node_modules/.bin` and common bin dirs, so both the server binary and the
 * `env node` shebang it relies on resolve even when Electron's PATH is minimal.
 */
export function buildServerPath(workspaceRoot: string): string {
  const bundledDir = bundledBinDir()
  const extra = [
    join(workspaceRoot, 'node_modules', '.bin'),
    ...(bundledDir ? [bundledDir] : []),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    dirname(process.execPath),
  ]
  const existing = process.env.PATH ?? ''
  return [...extra, existing].filter(Boolean).join(delimiter)
}

/** Language servers whose marker files are present in the workspace root. */
export function detectWorkspaceServers(workspaceRoot: string): LanguageServerDef[] {
  if (!workspaceRoot?.trim()) return []
  return LANGUAGE_SERVERS.filter((server) =>
    (server.markers ?? []).some((marker) =>
      existsSync(join(workspaceRoot, marker)),
    ),
  )
}

export type LanguageServerMatch = {
  server: LanguageServerDef
  languageId: string
}

/** Resolve the language server + languageId for a file path, or null if none. */
export function matchLanguageServer(filePath: string): LanguageServerMatch | null {
  const ext = extname(filePath).toLowerCase()
  if (!ext) return null
  for (const server of LANGUAGE_SERVERS) {
    const languageId = server.extensions[ext]
    if (languageId) return { server, languageId }
  }
  return null
}

/** Whether any known language server handles this file (cheap pre-check). */
export function isLspSupportedFile(filePath: string): boolean {
  return matchLanguageServer(filePath) !== null
}
