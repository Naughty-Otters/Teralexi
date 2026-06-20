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
}

const agentRunScopeStorage = new AsyncLocalStorage<AgentRunScopeStore>()

export function getCurrentAgentRunScope(): AgentRunScopeStore | undefined {
  return agentRunScopeStorage.getStore()
}

export async function runWithAgentRunScope<T>(
  scope: AgentRunScopeStore,
  fn: () => Promise<T>,
): Promise<T> {
  return agentRunScopeStorage.run(scope, fn)
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
