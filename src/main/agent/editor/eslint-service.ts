import { existsSync, writeFileSync, unlinkSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { createLogger } from '@main/logger'
import { resolveFilesCwd } from '@main/agent/workspace/workspace-ipc-helpers'
import { resolveUserProjectPath } from '@main/agent/sandbox'

const log = createLogger('agent.editor.eslint')

export type EditorLintDiagnostic = {
  line: number
  column: number
  endLine: number
  endColumn: number
  message: string
  severity: 'error' | 'warning'
  ruleId?: string
}

function hasEslintConfig(workspaceRoot: string): boolean {
  const names = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    '.eslintrc',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.json',
    '.eslintrc.yaml',
    '.eslintrc.yml',
  ]
  return names.some((name) => existsSync(join(workspaceRoot, name)))
}

function loadEslint(workspaceRoot: string): typeof import('eslint').ESLint | null {
  try {
    const req = createRequire(join(workspaceRoot, 'package.json'))
    const mod = req('eslint') as typeof import('eslint')
    return mod.ESLint
  } catch {
    try {
      const bundledReq = createRequire(import.meta.url)
      const mod = bundledReq('eslint') as typeof import('eslint')
      return mod.ESLint
    } catch {
      return null
    }
  }
}

export async function lintWorkspaceFile(
  conversationId: string,
  relativePath: string,
  content: string,
): Promise<{
  ok: boolean
  diagnostics?: EditorLintDiagnostic[]
  error?: string
}> {
  const resolved = resolveFilesCwd(conversationId.trim())
  if (!resolved.ok) return { ok: false, error: resolved.error }

  const rel = relativePath.replace(/\\/g, '/').trim()
  if (!rel) return { ok: false, error: 'relativePath is required.' }

  if (!hasEslintConfig(resolved.cwd)) {
    return { ok: true, diagnostics: [] }
  }

  const ESLint = loadEslint(resolved.cwd)
  if (!ESLint) {
    return { ok: true, diagnostics: [] }
  }

  const absPath = resolveUserProjectPath(resolved.cwd, rel)
  const tempDir = mkdtempSync(join(tmpdir(), 'openfde-eslint-'))
  const tempFile = join(tempDir, rel.split('/').pop() ?? 'temp.ts')

  try {
    writeFileSync(tempFile, content, 'utf8')
    const eslint = new ESLint({ cwd: resolved.cwd })
    const results = await eslint.lintFiles([tempFile])
    const diagnostics: EditorLintDiagnostic[] = []

    for (const result of results) {
      for (const message of result.messages) {
        diagnostics.push({
          line: message.line,
          column: message.column,
          endLine: message.endLine ?? message.line,
          endColumn: message.endColumn ?? message.column + 1,
          message: message.message,
          severity: message.severity === 2 ? 'error' : 'warning',
          ruleId: message.ruleId ?? undefined,
        })
      }
    }

    return { ok: true, diagnostics }
  } catch (err) {
    log.debug('ESLint lint failed', { err, relativePath: rel })
    return { ok: false, error: String(err) }
  } finally {
    try {
      if (existsSync(tempFile)) unlinkSync(tempFile)
    } catch {
      /* ignore */
    }
  }
}
