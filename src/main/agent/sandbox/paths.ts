import { realpathSync } from 'fs'
import path from 'path'
import {
  TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE_ENV,
  TERALEXI_AGENT_SANDBOX_ROOT_ENV,
  TERALEXI_AGENT_WORKSPACE_PATH_ENV,
  TERALEXI_AGENT_CONVERSATION_ID_ENV,
  SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY,
  SANDBOX_ROOT_GLOBAL_KEY,
  WORKSPACE_PATH_GLOBAL_KEY,
  CONVERSATION_ID_GLOBAL_KEY,
  getAgentRunWorkspacePath,
} from './run-context'
import {
  ensureToolLoopStepOutputDirs,
  getOutputResultsRelPrefix,
  getOutputScriptsRelPrefix,
  getSandboxOutputScopeFromEnv,
  remapLegacyPlanRelativePath,
  remapLegacySharedOutputPath,
  setSandboxOutputScope,
  toolLoopOutputRelBase,
  defaultToolLoopPreviewDir,
} from './tool-loop-output'

export {
  TERALEXI_AGENT_SANDBOX_ROOT_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
  TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE_ENV,
  SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY,
  ensureToolLoopStepOutputDirs,
  getOutputResultsRelPrefix,
  getOutputScriptsRelPrefix,
  getSandboxOutputScopeFromEnv,
  remapLegacyPlanRelativePath,
  remapLegacySharedOutputPath,
  setSandboxOutputScope,
  toolLoopOutputRelBase,
  defaultToolLoopPreviewDir,
}

export function getSandboxRootFromEnv(): string | undefined {
  const g = globalThis as unknown as Record<string, unknown>
  const fromGlobal = g[SANDBOX_ROOT_GLOBAL_KEY]
  if (typeof fromGlobal === 'string' && fromGlobal.trim()) {
    return fromGlobal.trim()
  }
  return process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV]?.trim() || undefined
}

export function requireActiveSandbox():
  | { ok: true; root: string }
  | { ok: false; message: string } {
  const root = getSandboxRootFromEnv()
  if (!root) {
    return {
      ok: false,
      message:
        'No active agent sandbox. File tools are only available during an agent run with a sandbox.',
    }
  }
  return { ok: true, root }
}

/**
 * Resolve a path for containment comparison, following symlinks.
 *
 * For a path that doesn't exist yet (e.g. a move/copy/write destination), we
 * realpath the nearest EXISTING ancestor and re-append the missing tail. This
 * keeps a non-existent target consistent with an existing root that resolves
 * through symlinks (notably macOS `/var`→`/private/var`, `/tmp`→`/private/tmp`),
 * which otherwise made every new-file containment check fail.
 */
function resolvePathForContainment(filePath: string): string {
  const abs = path.resolve(filePath)
  let current = abs
  const tail: string[] = []
  for (;;) {
    try {
      const real = realpathSync(current)
      return tail.length > 0 ? path.join(real, ...tail) : real
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return abs // reached the filesystem root; give up
      tail.unshift(path.basename(current))
      current = parent
    }
  }
}

/** True when `absPath` is inside `root` (file or directory). */
export function isPathInsideSandbox(sandboxRoot: string, absPath: string): boolean {
  const root = resolvePathForContainment(sandboxRoot)
  const target = resolvePathForContainment(absPath)
  const rel = path.relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export function isPathInsideWorkspace(
  workspacePath: string,
  absPath: string,
): boolean {
  return isPathInsideSandbox(workspacePath, absPath)
}

export function isPathInFilesystemContext(
  sandboxRoot: string,
  workspacePath: string | null | undefined,
  absPath: string,
): boolean {
  if (isPathInsideSandbox(sandboxRoot, absPath)) return true
  const ws = workspacePath?.trim()
  return Boolean(ws && isPathInsideWorkspace(ws, absPath))
}

/** Relative paths that refer to agent sandbox layout (not the user project tree). */
export function isSandboxArtifactRelativePath(userPath: string): boolean {
  const remapped = remapLegacySharedOutputPath(userPath.trim())
  const seg = remapped.replace(/^[/\\]+/, '').split(/[/\\]+/).filter(Boolean)
  if (seg.length === 0) return false
  const head = seg[0]
  return (
    head === 'output' ||
    head === 'plans' ||
    head === 'followup' ||
    head === 'refs' ||
    head === 'skills' ||
    head === 'scripts'
  )
}

/**
 * Paths like `/src/foo.ts` that LLMs emit as project-relative, not host absolute paths
 * (which normally start with `/Users`, `/home`, `/private`, `C:\`, etc.).
 */
export function isPseudoAbsoluteProjectPath(userPath: string): boolean {
  const trimmed = userPath.trim()
  if (!path.isAbsolute(trimmed)) return false
  const normalized = trimmed.replace(/\\/g, '/')
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return false
  if (
    /^\/(?:Users|home|tmp|var|private|opt|Volumes|Applications|etc|usr|System)(?:\/|$)/i.test(
      normalized,
    )
  ) {
    return false
  }
  return true
}

/**
 * When the workspace folder is itself a subdir (e.g. `…/src`), LLMs often reuse
 * paths like `src/mcp-server.ts` from a prior listing at repo root. Strip a leading
 * segment that duplicates the workspace folder basename before resolving.
 */
export function normalizeWorkspaceRelativePath(
  workspacePath: string,
  userPath: string,
): string {
  const trimmed = userPath.trim()
  if (!trimmed) return trimmed

  if (path.isAbsolute(trimmed) && !isPseudoAbsoluteProjectPath(trimmed)) {
    return trimmed
  }

  const relativePart = isPseudoAbsoluteProjectPath(trimmed)
    ? trimmed.replace(/^[/\\]+/, '')
    : trimmed.replace(/^[/\\]+/, '')

  const wsBase = path.basename(path.resolve(workspacePath))
  const segments = relativePart.split(/[/\\]+/).filter(Boolean)
  if (segments.length >= 1 && wsBase && segments[0] === wsBase) {
    const rest = segments.slice(1).join('/')
    return rest || '.'
  }
  return relativePart
}

/** Resolve a path under the user workspace (relative or pseudo-absolute like `/src/foo.ts`). */
export function resolveUserProjectPath(
  workspacePath: string,
  userPath: string,
): string {
  const trimmed = userPath.trim()
  if (!trimmed) {
    throw new Error('Empty path')
  }
  if (isPseudoAbsoluteProjectPath(trimmed)) {
    return resolveRelativeInsideRoot(
      workspacePath,
      normalizeWorkspaceRelativePath(workspacePath, trimmed),
    )
  }
  if (path.isAbsolute(trimmed)) {
    const abs = path.normalize(path.resolve(trimmed))
    if (isPathInsideWorkspace(workspacePath, abs)) return abs
    throw new Error(
      `Path must be inside the user workspace: ${userPath}. Workspace root: ${workspacePath.trim()}.`,
    )
  }
  return resolveRelativeInsideRoot(
    workspacePath,
    normalizeWorkspaceRelativePath(workspacePath, trimmed),
  )
}

export function resolveRelativeInsideRoot(root: string, userPath: string): string {
  const base = path.resolve(root)
  const trimmed = userPath.trim()
  if (!trimmed) {
    throw new Error('Empty path')
  }
  if (trimmed === '.' || trimmed === './') {
    return base
  }

  const stripped = trimmed.replace(/^[/\\]+/, '')
  const segments = stripped.split(/[/\\]+/).filter(Boolean)
  if (segments.length === 0) {
    return base
  }

  const resolved = path.normalize(path.resolve(base, ...segments))
  const rel = path.relative(base, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes root: ${userPath}`)
  }
  return resolved
}

export function resolveSandboxRelativePath(
  sandboxRoot: string,
  userPath: string,
): string {
  return resolveRelativeInsideRoot(sandboxRoot, userPath)
}

export function resolveScopedSandboxPath(
  sandboxRoot: string,
  userPath: string,
): string {
  const trimmed = userPath.trim()
  if (path.isAbsolute(trimmed)) {
    return resolvePathMustBeInside(sandboxRoot, trimmed)
  }
  return resolvePathMustBeInside(
    sandboxRoot,
    remapLegacySharedOutputPath(trimmed),
  )
}

export function resolvePathMustBeInside(
  sandboxRoot: string,
  userPath: string,
): string {
  const trimmed = userPath.trim()
  if (!trimmed) {
    throw new Error('Empty path')
  }

  if (path.isAbsolute(trimmed)) {
    const abs = path.normalize(path.resolve(trimmed))
    if (!isPathInsideSandbox(sandboxRoot, abs)) {
      throw new Error(
        `Path must be inside the sandbox: ${userPath}`,
      )
    }
    return abs
  }

  if (isSandboxArtifactRelativePath(trimmed)) {
    return resolveSandboxRelativePath(
      sandboxRoot,
      remapLegacySharedOutputPath(trimmed),
    )
  }

  return resolveSandboxRelativePath(sandboxRoot, trimmed)
}

export function resolvePathAllowingOutside(
  sandboxRoot: string,
  userPath: string,
  workspacePath?: string | null,
): string {
  const trimmed = userPath.trim()
  if (!trimmed) {
    throw new Error('Empty path')
  }

  try {
    return resolvePathInContext(sandboxRoot, workspacePath, userPath)
  } catch (err) {
    if (path.isAbsolute(trimmed)) {
      return path.normalize(path.resolve(trimmed))
    }
    throw err
  }
}

export function assertMoveAllowed(
  sandboxRoot: string,
  workspacePath: string | null | undefined,
  sourceAbs: string,
  destAbs: string,
): void {
  const destInside = isPathInFilesystemContext(sandboxRoot, workspacePath, destAbs)
  if (!destInside) {
    throw new Error(
      'Move destination must be inside the sandbox or user workspace.',
    )
  }

  const sourceInside = isPathInFilesystemContext(
    sandboxRoot,
    workspacePath,
    sourceAbs,
  )
  if (sourceInside && !destInside) {
    throw new Error(
      'Cannot move files or directories out of the sandbox or workspace.',
    )
  }
}

// ── Workspace-aware path resolution ──────────────────────────────────────────

/** Active user project folder for this agent run (ALS → global → env). */
export function getWorkspacePathFromEnv(): string | null {
  const fromRun = getAgentRunWorkspacePath()
  if (fromRun) return fromRun

  const g = globalThis as unknown as Record<string, unknown>
  const fromGlobal = g[WORKSPACE_PATH_GLOBAL_KEY]
  if (typeof fromGlobal === 'string' && fromGlobal.trim()) {
    return fromGlobal.trim()
  }
  return process.env[TERALEXI_AGENT_WORKSPACE_PATH_ENV]?.trim() || null
}

/** Active conversation id for plan-mode tools (global → env). */
export function getConversationIdFromEnv(): string | undefined {
  const g = globalThis as unknown as Record<string, unknown>
  const fromGlobal = g[CONVERSATION_ID_GLOBAL_KEY]
  if (typeof fromGlobal === 'string' && fromGlobal.trim()) {
    return fromGlobal.trim()
  }
  return process.env[TERALEXI_AGENT_CONVERSATION_ID_ENV]?.trim() || undefined
}

/**
 * Resolve a path inside the sandbox and/or the user workspace.
 *
 * - Absolute: allowed when inside workspace or sandbox.
 * - Relative: sandbox artifact dirs (`output/`, `scripts/`, …) → sandbox;
 *   otherwise → user workspace when set, else sandbox.
 */
export function resolvePathInContext(
  sandboxRoot: string,
  workspacePath: string | null | undefined,
  userPath: string,
): string {
  const trimmed = userPath.trim()
  if (!trimmed) {
    throw new Error('Empty path')
  }

  const ws = workspacePath?.trim() || null

  if (path.isAbsolute(trimmed)) {
    const abs = path.normalize(path.resolve(trimmed))
    if (ws && isPathInsideWorkspace(ws, abs)) return abs
    if (isPathInsideSandbox(sandboxRoot, abs)) return abs
    if (ws && isPseudoAbsoluteProjectPath(trimmed)) {
      return resolveRelativeInsideRoot(
        ws,
        normalizeWorkspaceRelativePath(ws, trimmed),
      )
    }
    throw new Error(formatPathInContextError(userPath, sandboxRoot, ws))
  }

  if (isSandboxArtifactRelativePath(trimmed)) {
    return resolvePathMustBeInside(
      sandboxRoot,
      remapLegacySharedOutputPath(trimmed),
    )
  }

  if (ws) {
    return resolveRelativeInsideRoot(
      ws,
      normalizeWorkspaceRelativePath(ws, trimmed),
    )
  }

  return resolvePathMustBeInside(sandboxRoot, trimmed)
}

/**
 * Scoped reads/writes: same rules as {@link resolvePathInContext}.
 */
export function resolveScopedPathInContext(
  sandboxRoot: string,
  workspacePath: string | null | undefined,
  userPath: string,
): string {
  return resolvePathInContext(sandboxRoot, workspacePath, userPath)
}

function formatPathInContextError(
  userPath: string,
  sandboxRoot: string,
  workspacePath: string | null,
): string {
  if (!workspacePath?.trim()) {
    if (path.isAbsolute(userPath.trim())) {
      return (
        `Path must be inside the sandbox or user workspace: ${userPath}. ` +
        'No workspace folder is bound for this conversation — the user must pick the project folder (folder icon in the composer) while the agent is idle, then retry with a workspace-relative path (e.g. src/foo.py) or the same absolute path.'
      )
    }
    return (
      `Path must be inside the sandbox or user workspace: ${userPath}. ` +
      'No workspace folder is set; pick a project folder in the composer or use sandbox paths like output/.'
    )
  }
  return (
    `Path must be inside the sandbox or user workspace: ${userPath}. ` +
    `Workspace root: ${workspacePath.trim()}. Use a path under that folder (relative or absolute).`
  )
}

export function sandboxPathError(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : String(error) }
}
