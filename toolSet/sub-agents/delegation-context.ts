import { getCurrentAgentRunScope } from '@main/agent/run/run-scope'

export type SubAgentChildParams = {
  agentId: string
  parentOpts: Record<string, unknown>
  task: string
  contextMessages?: unknown[]
  allowedToolNames?: string[] | 'all'
  /** When false, keep worktree for manual Merge/PR (e.g. best-of-N). */
  autoMergeWorktree?: boolean
}

export type SubAgentParentRun = {
  meta?: { depth?: number; runId?: string }
  executeChildAndMerge: (params: SubAgentChildParams) => Promise<{
    hitlPaused: boolean
    stepOutputs: Record<string, unknown>
  }>
  spawnChildRun?: (
    params: SubAgentChildParams,
    opts?: { waitMode?: 'blocking' | 'background'; detached?: boolean },
  ) => Promise<{
    runId: string
    agentId: string
    agentName: string
    promise: Promise<{
      runId: string
      agentId: string
      agentName: string
      status: string
      error?: string
      result?: {
        hitlPaused: boolean
        stepOutputs: Record<string, unknown>
        pausedStageId?: string
      }
      childRun?: unknown
      worktreePath?: string
      worktreeBranch?: string
      worktreeDiffStat?: string
      worktreeOutcome?: 'merged' | 'discarded'
    }>
  }>
  cancelChildRun?: (runId: string) => boolean
  waitForChildRuns?: (runIds: string[]) => Promise<
    Array<{
      runId: string
      agentId: string
      agentName: string
      status: string
      report?: string
      summary?: string
      filesTouched?: string[]
      openQuestions?: string[]
      error?: string
      hitlPaused: boolean
      result?: { hitlPaused: boolean; stepOutputs: Record<string, unknown>; pausedStageId?: string }
      childRun?: unknown
      worktreePath?: string
      worktreeBranch?: string
      worktreeOutcome?: 'merged' | 'discarded'
    }>
  >
  remainingParallelSlots?: () => number
  mergeChildHitlPause?: (
    child: unknown,
    result: { hitlPaused: boolean; stepOutputs: Record<string, unknown>; pausedStageId?: string },
  ) => void
}

export type SubAgentDelegationContext = {
  parentRun?: SubAgentParentRun
  opts?: Record<string, unknown>
  skillId?: string
  conversationId?: string
  workspacePath?: string
  agentId?: string
  stepId?: string
  currentMessages?: unknown[]
  getLatestUserMessageContent?: () => string
  allowSubAgents?: boolean
  subAgentIds?: string[]
  /** Resolve catalog ids like `coding` → `skill:coding` (main process only). */
  resolveSubAgentTargetId?: (agentId: string) => Promise<string>
}

/**
 * Skill tools are esbuild-bundled into per-module caches while the main process
 * imports this file directly — a module-level singleton would not be shared.
 * Use a process-global stack (same pattern as sandbox globals), keyed by runId
 * when an AgentRun ALS scope is active so concurrent roots do not cross-bind.
 */
const SUB_AGENT_DELEGATION_STACK_KEY = '__teralexiSubAgentDelegationStack'

type DelegationStackEntry = {
  runId?: string
  ctx: SubAgentDelegationContext
}

type DelegationStack = DelegationStackEntry[]

function delegationStack(): DelegationStack {
  const g = globalThis as Record<string, unknown>
  let stack = g[SUB_AGENT_DELEGATION_STACK_KEY] as DelegationStack | undefined
  if (!stack) {
    stack = []
    g[SUB_AGENT_DELEGATION_STACK_KEY] = stack
  }
  return stack
}

function currentRunId(): string | undefined {
  return getCurrentAgentRunScope()?.runId
}

export function bindSubAgentDelegation(
  ctx: SubAgentDelegationContext | undefined,
): void {
  if (!ctx) return
  delegationStack().push({ runId: currentRunId(), ctx })
}

export function clearSubAgentDelegation(): void {
  const stack = delegationStack()
  const runId = currentRunId()
  if (!runId) {
    if (stack.length > 0) stack.pop()
    return
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]?.runId === runId) {
      stack.splice(i, 1)
      return
    }
  }
  if (stack.length > 0) stack.pop()
}

/** Clears the full stack — for tests and hard resets. */
export function resetSubAgentDelegationStack(): void {
  delegationStack().length = 0
}

export function getSubAgentDelegation(): SubAgentDelegationContext | undefined {
  const stack = delegationStack()
  const runId = currentRunId()
  if (runId) {
    for (let i = stack.length - 1; i >= 0; i--) {
      const entry = stack[i]
      if (entry?.runId === runId) return entry.ctx
    }
  }
  return stack[stack.length - 1]?.ctx
}

export function requireSubAgentDelegation(): SubAgentDelegationContext {
  const ctx = getSubAgentDelegation()
  if (!ctx) {
    throw new Error('Sub-agent tools require an active agent run context')
  }
  return ctx
}

export function assertRootSubAgentDelegation(): SubAgentDelegationContext {
  const ctx = requireSubAgentDelegation()
  const depth = ctx.parentRun?.meta?.depth
  if (typeof depth === 'number' && depth > 0) {
    throw new Error('Sub-agent delegation is only available on the root agent run')
  }
  return ctx
}

export function isSubAgentIdAllowed(
  requestedId: string,
  resolvedId: string,
  allowList: string[] | undefined,
): boolean {
  if (!allowList?.length) return true
  const allowed = new Set(allowList)
  return allowed.has(requestedId) || allowed.has(resolvedId)
}

/**
 * Params for {@link SubAgentParentRun.executeChildAndMerge} / `spawnChildRun`.
 *
 * Do not set `contextMessages` here — {@link AgentRun.createChild} builds the full
 * parent pipeline + thread envelope from `parentContext` when the child run starts.
 */
export function buildSubAgentChildParams(
  delegation: SubAgentDelegationContext,
  input: {
    agentId: string
    task: string
    allowedToolNames?: string[] | 'all'
    autoMergeWorktree?: boolean
  },
): SubAgentChildParams {
  const agentId = input.agentId.trim()
  const task =
    input.task.trim() ||
    delegation.getLatestUserMessageContent?.().trim() ||
    'Complete the delegated task.'

  return {
    agentId,
    parentOpts: delegation.opts ?? {},
    task,
    allowedToolNames: input.allowedToolNames,
    autoMergeWorktree: input.autoMergeWorktree,
  }
}

export async function resolveSubAgentTargetIdFromDelegation(
  delegation: SubAgentDelegationContext,
  agentId: string,
): Promise<string> {
  const requestedId = agentId.trim()
  if (!requestedId) {
    throw new Error('Sub-agent invocation requires agentId')
  }
  if (delegation.resolveSubAgentTargetId) {
    return delegation.resolveSubAgentTargetId(requestedId)
  }
  return requestedId
}
