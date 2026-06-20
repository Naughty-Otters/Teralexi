import { existsSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { LanguageServerDef } from './language-servers'

const MAX_FILES_SCANNED = 500
const MAX_DEPTH = 10
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  '.next',
  'coverage',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
])

/** Common entry points checked before a full tree walk. */
const PREFERRED_RELATIVE_PATHS: Record<string, string[]> = {
  typescript: [
    'src/main/index.ts',
    'src/index.ts',
    'src/main.ts',
    'index.ts',
    'src/app.ts',
  ],
  pyright: ['src/main.py', 'main.py', 'app.py', 'src/__init__.py'],
  gopls: ['main.go', 'cmd/main.go'],
  'rust-analyzer': ['src/main.rs', 'src/lib.rs'],
}

/**
 * Find a representative source file so language servers that require an open
 * document / loaded project (notably TypeScript) can answer `workspace/symbol`.
 */
export function findWorkspaceSeedFile(
  workspaceRoot: string,
  server: LanguageServerDef,
): string | null {
  const root = workspaceRoot.trim()
  if (!root) return null

  const exts = new Set(Object.keys(server.extensions))
  for (const rel of PREFERRED_RELATIVE_PATHS[server.id] ?? []) {
    const candidate = join(root, rel)
    if (existsSync(candidate) && exts.has(extname(candidate).toLowerCase())) {
      return candidate
    }
  }

  let scanned = 0
  const walk = (dir: string, depth: number): string | null => {
    if (depth > MAX_DEPTH || scanned >= MAX_FILES_SCANNED) return null

    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return null
    }

    for (const ent of entries) {
      if (scanned >= MAX_FILES_SCANNED) return null
      const name = ent.name
      if (name.startsWith('.')) continue

      const full = join(dir, name)
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue
        const found = walk(full, depth + 1)
        if (found) return found
        continue
      }

      if (!ent.isFile()) continue
      scanned += 1
      const ext = extname(name).toLowerCase()
      if (exts.has(ext)) return full
    }

    return null
  }

  return walk(root, 0)
}
