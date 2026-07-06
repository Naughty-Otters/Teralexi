/**
 * Per–tool-loop-step sandbox output paths and active scope (env + globalThis).
 * Shared by the agent runtime and toolSet (via re-export in sandbox-paths).
 */
import { mkdirSync } from 'fs'
import { join } from 'path'
import { toolLoopFilesystemScopeFromStepKey } from '../run/flow-scoped-ids'

export const TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE_ENV =
  'TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE' as const
export const SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY =
  '__TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE__' as const

const TOOL_LOOP_OUTPUT_SEGMENT = 'toolLoop' as const

export function getSandboxOutputScopeFromEnv(): string | undefined {
  const g = globalThis as unknown as Record<string, unknown>
  const fromGlobal = g[SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY]
  if (typeof fromGlobal === 'string' && fromGlobal.trim()) {
    return fromGlobal.trim()
  }
  return process.env[TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE_ENV]?.trim() || undefined
}

export function setSandboxOutputScope(scope: string | undefined): void {
  const g = globalThis as unknown as Record<string, unknown>
  if (scope?.trim()) {
    const v = scope.trim()
    process.env[TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE_ENV] = v
    g[SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY] = v
  } else {
    delete process.env[TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE_ENV]
    delete g[SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY]
  }
}

/** Sandbox-relative `output/toolLoop/<scope…>` using `/` segments only. */
export function toolLoopOutputRelBase(scopeOrStepKey: string): string {
  const pathScope = toolLoopFilesystemScopeFromStepKey(scopeOrStepKey)
  if (!pathScope) {
    return join('output', TOOL_LOOP_OUTPUT_SEGMENT)
  }
  const segments = pathScope.split(/[/\\]+/).filter(Boolean)
  const instanceSegments =
    segments[0] === TOOL_LOOP_OUTPUT_SEGMENT ? segments.slice(1) : segments
  return join('output', TOOL_LOOP_OUTPUT_SEGMENT, ...instanceSegments)
}

/** Default preview directory for tool-loop output under a sandbox root. */
export function defaultToolLoopPreviewDir(sandboxRoot: string): string {
  return join(sandboxRoot, 'output', TOOL_LOOP_OUTPUT_SEGMENT)
}

/** Sandbox-relative results dir for the active tool-loop step, or shared `output/results`. */
export function getOutputResultsRelPrefix(scope?: string): string {
  const active = scope?.trim() || getSandboxOutputScopeFromEnv()
  if (active) {
    return join(toolLoopOutputRelBase(active), 'results')
  }
  return join('output', 'results')
}

/** Sandbox-relative scripts dir for run_script in the active tool-loop step. */
export function getOutputScriptsRelPrefix(scope?: string): string {
  const active = scope?.trim() || getSandboxOutputScopeFromEnv()
  if (active) {
    return join(toolLoopOutputRelBase(active), 'scripts')
  }
  return join('output', 'scripts')
}

/** Creates `output/toolLoop/<scope>/{results,scripts}` under the sandbox root. */
export function ensureToolLoopStepOutputDirs(
  sandboxRoot: string,
  scope: string,
): void {
  const base = join(sandboxRoot, toolLoopOutputRelBase(scope))
  mkdirSync(join(base, 'results'), { recursive: true })
  mkdirSync(join(base, 'scripts'), { recursive: true })
}

/** Map deprecated `output/plans/...` to canonical `<sandbox>/plans/...`. */
export function remapLegacyPlanRelativePath(userPath: string): string {
  const stripped = userPath.trim().replace(/^[/\\]+/, '')
  const seg = stripped.split(/[/\\]+/).filter(Boolean)
  if (seg.length >= 2 && seg[0] === 'output' && seg[1] === 'plans') {
    return join('plans', ...seg.slice(2))
  }
  return stripped
}

/**
 * When a tool-loop scope is active, map legacy `output/results/...` and `output/scripts/...`
 * paths to the scoped step folder.
 */
export function remapLegacySharedOutputPath(userPath: string): string {
  const stripped = remapLegacyPlanRelativePath(userPath)
  const seg = stripped.split(/[/\\]+/).filter(Boolean)
  if (seg.length >= 2 && seg[0] === 'output' && seg[1] === 'results') {
    return join(getOutputResultsRelPrefix(), ...seg.slice(2))
  }
  if (seg.length >= 2 && seg[0] === 'output' && seg[1] === 'scripts') {
    return join(getOutputScriptsRelPrefix(), ...seg.slice(2))
  }
  return stripped
}
