import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { createLogger } from '@main/logger'
import { resolveFilesCwd } from '@main/agent/workspace/workspace-ipc-helpers'
import { resolveUserProjectPath } from '@main/agent/sandbox'
import { bundledBinDir } from '@main/agent/lsp/language-servers'

const log = createLogger('agent.editor.format')

function binFileName(command: string): string {
  return process.platform === 'win32' ? `${command}.cmd` : command
}

function resolvePrettierBin(workspaceRoot: string): string | null {
  const local = join(workspaceRoot, 'node_modules', '.bin', binFileName('prettier'))
  if (existsSync(local)) return local

  const bundledDir = bundledBinDir()
  if (bundledDir) {
    const bundled = join(bundledDir, binFileName('prettier'))
    if (existsSync(bundled)) return bundled
  }

  return null
}

function hasPrettierConfig(workspaceRoot: string): boolean {
  const names = [
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.yml',
    '.prettierrc.yaml',
    '.prettierrc.js',
    '.prettierrc.cjs',
    'prettier.config.js',
    'prettier.config.cjs',
    'prettier.config.mjs',
  ]
  return names.some((name) => existsSync(join(workspaceRoot, name)))
}

export async function formatWorkspaceFile(
  conversationId: string,
  relativePath: string,
  content: string,
): Promise<{ ok: boolean; content?: string; error?: string }> {
  const resolved = resolveFilesCwd(conversationId.trim())
  if (!resolved.ok) return { ok: false, error: resolved.error }

  const rel = relativePath.replace(/\\/g, '/').trim()
  if (!rel) return { ok: false, error: 'relativePath is required.' }

  const absPath = resolveUserProjectPath(resolved.cwd, rel)
  const prettierBin = resolvePrettierBin(resolved.cwd)
  if (!prettierBin && !hasPrettierConfig(resolved.cwd)) {
    return { ok: false, error: 'Prettier is not configured for this workspace.' }
  }

  try {
    const req = createRequire(join(resolved.cwd, 'package.json'))
    let prettier: {
      format: (source: string, options?: Record<string, unknown>) => Promise<string>
      resolveConfig: (path: string) => Promise<Record<string, unknown> | null>
      getFileInfo: (path: string) => Promise<{ ignored: boolean }>
    }

    try {
      prettier = req('prettier')
    } catch {
      const bundledReq = createRequire(import.meta.url)
      prettier = bundledReq('prettier')
    }

    const fileInfo = await prettier.getFileInfo(absPath)
    if (fileInfo.ignored) {
      return { ok: false, error: 'File is ignored by Prettier.' }
    }

    const config = await prettier.resolveConfig(absPath)
    const formatted = await prettier.format(content, {
      ...config,
      filepath: absPath,
    })
    return { ok: true, content: formatted }
  } catch (err) {
    log.debug('Prettier format failed', { err, relativePath: rel })
    return { ok: false, error: String(err) }
  }
}
