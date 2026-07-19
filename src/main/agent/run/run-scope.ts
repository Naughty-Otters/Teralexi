import { AsyncLocalStorage } from 'node:async_hooks'
import type { AgentRunId } from './types'

export type AgentRunScopeStore = {
  runId: AgentRunId
  parentRunId?: AgentRunId
  depth: number
  sandboxRoot?: string
  sandboxOutputScope?: string
  /** User-selected project folder; independent of sandbox. */
  workspacePath?: string
  /** Conversation id for plan-mode and conversation-scoped tools. */
  conversationId?: string
  /** Assistant message id for the current turn. */
  assistantMessageId?: string
}

/**
 * Process-global ALS so main-process and esbuild-bundled skill modules share
 * the same store (module-level ALS would fork per bundle).
 */
const AGENT_RUN_SCOPE_ALS_KEY = '__teralexiAgentRunScopeALS'

function agentRunScopeStorage(): AsyncLocalStorage<AgentRunScopeStore> {
  const g = globalThis as Record<string, unknown>
  let als = g[AGENT_RUN_SCOPE_ALS_KEY] as
    | AsyncLocalStorage<AgentRunScopeStore>
    | undefined
  if (!als) {
    als = new AsyncLocalStorage<AgentRunScopeStore>()
    g[AGENT_RUN_SCOPE_ALS_KEY] = als
  }
  return als
}

export function getCurrentAgentRunScope(): AgentRunScopeStore | undefined {
  return agentRunScopeStorage().getStore()
}

export async function runWithAgentRunScope<T>(
  scope: AgentRunScopeStore,
  fn: () => Promise<T>,
): Promise<T> {
  return agentRunScopeStorage().run(scope, fn)
}

/** Child output scope under the parent sandbox (output/subRuns/<runId>). */
export function childSandboxOutputScope(
  parentScope: AgentRunScopeStore | undefined,
  childRunId: AgentRunId,
): string {
  const base = parentScope?.sandboxOutputScope?.trim()
  const segment = `output/subRuns/${childRunId}`
  return base ? `${base}/${segment}` : segment
}

/**
 * Env vars for child processes spawned by tools, sourced from the current ALS
 * run scope (does not mutate process-wide globals).
 */
export function agentRunEnvFromScope(
  scope: AgentRunScopeStore | undefined = getCurrentAgentRunScope(),
): Record<string, string> {
  if (!scope) return {}
  const env: Record<string, string> = {}
  if (scope.sandboxRoot?.trim()) {
    env.TERALEXI_AGENT_SANDBOX_ROOT = scope.sandboxRoot.trim()
  }
  if (scope.sandboxOutputScope?.trim()) {
    env.TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE = scope.sandboxOutputScope.trim()
  }
  if (scope.workspacePath?.trim()) {
    env.TERALEXI_AGENT_WORKSPACE_PATH = scope.workspacePath.trim()
  }
  if (scope.conversationId?.trim()) {
    env.TERALEXI_AGENT_CONVERSATION_ID = scope.conversationId.trim()
  }
  if (scope.assistantMessageId?.trim()) {
    env.TERALEXI_AGENT_ASSISTANT_MESSAGE_ID = scope.assistantMessageId.trim()
  }
  return env
}
