/**
 * Active agent-run sandbox root for shell tools.
 *
 * Skill tools are often loaded from a separate esbuild bundle; they read this
 * location via `process.env` and `globalThis` (bundles share the same isolate,
 * so globalThis is reliable when env propagation is odd in Electron).
 *
 * Per-run values live in {@link runWithAgentRunScope} (AsyncLocalStorage).
 * Process globals/env are updated only inside {@link runWithExclusiveSandboxGlobals}
 * so concurrent agent runs cannot overwrite each other's sandbox paths.
 */
import { createLogger, traceFunction } from '@main/logger'
import {
  TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE_ENV,
  SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY,
  setSandboxOutputScope,
} from './tool-loop-output'
import { getCurrentAgentRunScope } from '../run/run-scope'

export const TERALEXI_AGENT_SANDBOX_ROOT_ENV = 'TERALEXI_AGENT_SANDBOX_ROOT' as const

/** Must match {@link toolSet/shell-command.ts} */
export const SANDBOX_ROOT_GLOBAL_KEY = '__TERALEXI_AGENT_SANDBOX_ROOT__' as const

/** Env var carrying the user-selected workspace folder path for the current run. */
export const TERALEXI_AGENT_WORKSPACE_PATH_ENV = 'TERALEXI_AGENT_WORKSPACE_PATH' as const

export const WORKSPACE_PATH_GLOBAL_KEY = '__TERALEXI_AGENT_WORKSPACE_PATH__' as const

/** Active conversation id for plan-mode and other conversation-scoped tools. */
export const TERALEXI_AGENT_CONVERSATION_ID_ENV = 'TERALEXI_AGENT_CONVERSATION_ID' as const

export const CONVERSATION_ID_GLOBAL_KEY = '__TERALEXI_AGENT_CONVERSATION_ID__' as const

export {
  TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE_ENV,
  SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY,
}

const log = createLogger('sandbox.run-context')

function applySandboxRootToGlobals(root: string | undefined): void {
  const g = globalThis as unknown as Record<string, unknown>
  if (root?.trim()) {
    const v = root.trim()
    process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV] = v
    g[SANDBOX_ROOT_GLOBAL_KEY] = v
  } else {
    delete process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV]
    delete g[SANDBOX_ROOT_GLOBAL_KEY]
    setSandboxOutputScope(undefined)
  }
}

function applySandboxOutputScopeToGlobals(scope: string | undefined): void {
  setSandboxOutputScope(scope)
}

/** Used by {@link runWithAgentRunScope} to stack sandbox bindings per run. */
export function setAgentRunSandboxGlobals(options: {
  root?: string
  outputScope?: string
}): void {
  applySandboxRootToGlobals(options.root)
  applySandboxOutputScopeToGlobals(options.outputScope)
}

export function clearAgentRunSandboxGlobals(): void {
  applySandboxRootToGlobals(undefined)
  applySandboxOutputScopeToGlobals(undefined)
}

function setAgentRunSandboxRootImpl(root: string | undefined): void {
  const scope = getCurrentAgentRunScope()
  if (!scope) return
  scope.sandboxRoot = root?.trim() || undefined
}

function getAgentRunSandboxRootImpl(): string | undefined {
  const fromScope = getCurrentAgentRunScope()?.sandboxRoot?.trim()
  if (fromScope) return fromScope

  const g = globalThis as unknown as Record<string, unknown>
  const fromGlobal = g[SANDBOX_ROOT_GLOBAL_KEY]
  if (typeof fromGlobal === 'string' && fromGlobal.trim()) {
    return fromGlobal.trim()
  }
  return process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV]?.trim() || undefined
}

export const setAgentRunSandboxRoot = traceFunction(
  log,
  'setAgentRunSandboxRoot',
  setAgentRunSandboxRootImpl,
)

export const getAgentRunSandboxRoot = traceFunction(
  log,
  'getAgentRunSandboxRoot',
  getAgentRunSandboxRootImpl,
)

function setAgentRunSandboxOutputScopeImpl(scope: string | undefined): void {
  const trimmed = scope?.trim() || undefined
  const runScope = getCurrentAgentRunScope()
  if (!runScope) return
  runScope.sandboxOutputScope = trimmed
}

function getAgentRunSandboxOutputScopeImpl(): string | undefined {
  const fromScope = getCurrentAgentRunScope()?.sandboxOutputScope?.trim()
  if (fromScope) return fromScope

  const g = globalThis as unknown as Record<string, unknown>
  const fromGlobal = g[SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY]
  if (typeof fromGlobal === 'string' && fromGlobal.trim()) {
    return fromGlobal.trim()
  }
  return process.env[TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE_ENV]?.trim() || undefined
}

export const setAgentRunSandboxOutputScope = traceFunction(
  log,
  'setAgentRunSandboxOutputScope',
  setAgentRunSandboxOutputScopeImpl,
)

export const getAgentRunSandboxOutputScope = traceFunction(
  log,
  'getAgentRunSandboxOutputScope',
  getAgentRunSandboxOutputScopeImpl,
)

export const clearAgentRunSandboxOutputScope = traceFunction(
  log,
  'clearAgentRunSandboxOutputScope',
  () => setAgentRunSandboxOutputScopeImpl(undefined),
)

// ── Workspace path (user project folder, independent of sandbox) ──────────────

function applyWorkspacePathToGlobals(workspacePath: string | undefined): void {
  const g = globalThis as unknown as Record<string, unknown>
  if (workspacePath?.trim()) {
    const v = workspacePath.trim()
    process.env[TERALEXI_AGENT_WORKSPACE_PATH_ENV] = v
    g[WORKSPACE_PATH_GLOBAL_KEY] = v
  } else {
    delete process.env[TERALEXI_AGENT_WORKSPACE_PATH_ENV]
    delete g[WORKSPACE_PATH_GLOBAL_KEY]
  }
}

function setAgentRunWorkspacePathImpl(workspacePath: string | undefined): void {
  const scope = getCurrentAgentRunScope()
  if (!scope) return
  scope.workspacePath = workspacePath?.trim() || undefined
}

function getAgentRunWorkspacePathImpl(): string | undefined {
  const fromScope = getCurrentAgentRunScope()?.workspacePath?.trim()
  if (fromScope) return fromScope

  const g = globalThis as unknown as Record<string, unknown>
  const fromGlobal = g[WORKSPACE_PATH_GLOBAL_KEY]
  if (typeof fromGlobal === 'string' && fromGlobal.trim()) {
    return fromGlobal.trim()
  }
  return process.env[TERALEXI_AGENT_WORKSPACE_PATH_ENV]?.trim() || undefined
}

export const setAgentRunWorkspacePath = traceFunction(
  log,
  'setAgentRunWorkspacePath',
  setAgentRunWorkspacePathImpl,
)

export const getAgentRunWorkspacePath = traceFunction(
  log,
  'getAgentRunWorkspacePath',
  getAgentRunWorkspacePathImpl,
)

export const clearAgentRunWorkspacePath = traceFunction(
  log,
  'clearAgentRunWorkspacePath',
  () => setAgentRunWorkspacePathImpl(undefined),
)

/** Include workspace in the global bindings snapshot (for the exclusive-globals lock). */
export function setAgentRunWorkspaceGlobal(workspacePath: string | undefined): void {
  applyWorkspacePathToGlobals(workspacePath)
}

export function clearAgentRunWorkspaceGlobal(): void {
  applyWorkspacePathToGlobals(undefined)
}
