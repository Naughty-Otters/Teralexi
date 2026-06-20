/**
 * Working-directory resolution for git/gh tools — the single source of truth
 * shared by the git tools ({@link ./git}) and the github skill's `gh` tools
 * (`skills/github/actions/github.ts`).
 */
import path from 'path'
import {
  getSandboxRootFromEnv,
  getWorkspacePathFromEnv,
  resolvePathAllowingOutside,
  resolvePathMustBeInside,
} from './sandbox-paths'

export type GitCwdResult = { ok: true; cwd: string } | { ok: false; error: string }

/**
 * Resolve `workingDirectory` relative to `baseRoot`. Relative paths must stay
 * inside `baseRoot`; absolute (or Windows-drive) paths may point outside it.
 */
export function resolveGitWorkingDirectory(
  baseRoot: string,
  workingDirectory?: string,
): GitCwdResult {
  const raw = workingDirectory?.trim() || '.'
  try {
    const cwd =
      path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)
        ? resolvePathAllowingOutside(baseRoot, raw)
        : resolvePathMustBeInside(baseRoot, raw)
    return { ok: true, cwd }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Pick the cwd for a git tool call from the active sandbox/workspace context:
 *  - explicit `workingDirectory` → resolved against the sandbox when one is
 *    active (the github skill clones repos into the sandbox), else the
 *    workspace folder;
 *  - otherwise → the user workspace folder when set (coding/code-review),
 *    falling back to the sandbox root (github default).
 */
export function resolveActiveGitCwd(workingDirectory?: string): GitCwdResult {
  const sandboxRoot = getSandboxRootFromEnv()
  const workspacePath = getWorkspacePathFromEnv()
  const wd = workingDirectory?.trim()

  if (wd) {
    const base = sandboxRoot ?? workspacePath ?? undefined
    if (!base) {
      return {
        ok: false,
        error:
          'workingDirectory was provided but no active sandbox or workspace folder is set for this conversation.',
      }
    }
    return resolveGitWorkingDirectory(base, wd)
  }

  if (workspacePath) return { ok: true, cwd: workspacePath }
  if (sandboxRoot) return { ok: true, cwd: sandboxRoot }

  return {
    ok: false,
    error:
      'No workspace folder or active sandbox is set for this conversation. ' +
      'Select a workspace folder, or run inside an agent sandbox, before using git tools.',
  }
}
