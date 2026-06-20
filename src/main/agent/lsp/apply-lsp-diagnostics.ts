import { isAbsolute, normalize } from 'node:path'
import { createLogger } from '@main/logger'
import { isPathInsideWorkspace, resolveUserProjectPath } from '@main/agent/sandbox'
import { getLspManager } from './lsp-manager'
import { isLspSupportedFile } from './language-servers'

const log = createLogger('agent.lsp.wrapper')

/** Only content-producing edits can have diagnostics (skip delete/move/copy). */
const CONTENT_EDIT_TOOLS = new Set(['edit_file', 'write_file', 'apply_patch', 'promote_artifact'])

/** Cap files diagnosed per tool call (apply_patch can touch many). */
const MAX_FILES_PER_CALL = 5

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toolSucceeded(result: Record<string, unknown>): boolean {
  if (result.error) return false
  return result.written === true || result.applied === true || result.promoted === true
}

function resolveEditedPath(rawPath: string, workspaceRoot: string): string {
  const trimmed = rawPath.trim()
  if (isAbsolute(trimmed) && isPathInsideWorkspace(workspaceRoot, normalize(trimmed))) {
    return normalize(trimmed)
  }
  return resolveUserProjectPath(workspaceRoot, trimmed)
}

/** Pull absolute, workspace-relative source paths out of a file-change result. */
function collectEditedPaths(
  result: Record<string, unknown>,
  workspaceRoot: string,
): string[] {
  const paths = new Set<string>()

  if (typeof result.path === 'string' && result.path.trim()) {
    paths.add(resolveEditedPath(result.path.trim(), workspaceRoot))
  }

  if (Array.isArray(result.files)) {
    for (const entry of result.files) {
      const rec = asRecord(entry)
      const p = rec?.path
      if (typeof p === 'string' && p.trim()) {
        paths.add(resolveEditedPath(p.trim(), workspaceRoot))
      }
    }
  }

  return [...paths].filter(
    (abs) =>
      isPathInsideWorkspace(workspaceRoot, abs) && isLspSupportedFile(abs),
  )
}

/**
 * Wrap file-change tools so their result carries LSP diagnostics for the edited
 * file(s). The model sees the diagnostics in the next loop iteration and can
 * self-correct. Best-effort: never throws, never blocks on a missing server.
 *
 * Apply this AFTER output truncation (so diagnostics aren't truncated away) and
 * BEFORE result recording (so the persisted result includes them).
 */
export function applyLspDiagnostics(toolSet: Record<string, unknown>): void {
  for (const name of Object.keys(toolSet)) {
    if (!CONTENT_EDIT_TOOLS.has(name)) continue
    const spec = toolSet[name] as Record<string, unknown> | null
    if (!spec || typeof spec['execute'] !== 'function') continue

    const origExecute = (
      spec['execute'] as (...a: unknown[]) => Promise<unknown>
    ).bind(spec)

    spec['execute'] = async (input: unknown): Promise<unknown> => {
      const result = await origExecute(input)
      try {
        const rec = asRecord(result)
        if (!rec || !toolSucceeded(rec)) return result

        const workspaceRoot =
          typeof rec.workspacePath === 'string' ? rec.workspacePath.trim() : ''
        if (!workspaceRoot) return result // diagnostics only for workspace files

        const paths = collectEditedPaths(rec, workspaceRoot).slice(
          0,
          MAX_FILES_PER_CALL,
        )
        if (paths.length === 0) return result

        const manager = getLspManager()
        const reports = await Promise.all(
          paths.map((p) => manager.getDiagnosticReport(p, workspaceRoot)),
        )

        const blocks = reports.map((r) => r.block).filter(Boolean)
        const errorCount = reports.reduce((n, r) => n + r.errorCount, 0)
        if (blocks.length === 0) return result

        return {
          ...rec,
          lspErrorCount: errorCount,
          lspDiagnostics: `LSP errors detected — fix these before continuing:\n${blocks.join('\n')}`,
        }
      } catch (err) {
        log.debug('applyLspDiagnostics failed; returning original result', { err })
        return result
      }
    }
  }
}
