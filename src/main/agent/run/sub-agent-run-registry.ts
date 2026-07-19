import { createLogger } from '@main/logger'
import type { SubAgentRunLifecycleEvent, SubAgentRunStatus } from '../types'
import { AgentRun } from './agent-run'
import { createSubAgentRunId } from './flow-scoped-ids'
import { buildSubAgentBrief } from './sub-flow-output-text'
import {
  resolveEngineAgent,
  subAgentReportPreview,
  type ResolveChildAgentParams,
} from './resolve-child-agent'
import type { AgentRunResult } from './types'
import { MAX_PARALLEL_SUB_AGENT_RUNS } from './types'
import { getWorkspacePath } from '../workspace/conversation-workspace'
import { isGitRepository } from '../injection/injectors/git-status'
import {
  gitCommitAllIfDirty,
  gitDeleteBranch,
  gitMergeBranch,
  gitWorktreeAdd,
  gitWorktreeDiffStat,
  gitWorktreeRemove,
  resolveSubAgentWorktreePath,
  subAgentWorktreeBranch,
} from '../workspace/git-worktree'
import { ghCreatePr, gitPush } from '../workspace/git-service'
import { FILE_CHANGE_TOOL_NAMES } from '@shared/file-change/types'

const log = createLogger('agent.subAgentRegistry')

const READ_ONLY_TOOL_HINTS = new Set([
  'read_file',
  'grep_files',
  'glob_files',
  'list_files',
  'lsp',
  'git_diff',
  'git_status',
  'git_log',
  'git_show',
  'web_search',
])

function shouldIsolateGitWorktree(params: ResolveChildAgentParams): boolean {
  if (params.isolateGitWorktree === false) return false
  if (params.workspacePathOverride?.trim()) return false
  if (params.isolateGitWorktree === true) return true
  const allowed = params.allowedToolNames
  if (Array.isArray(allowed) && allowed.length > 0) {
    const onlyReadOnly = allowed.every((name) => READ_ONLY_TOOL_HINTS.has(name))
    if (onlyReadOnly) return false
    const hasFileMutator = allowed.some((name) =>
      (FILE_CHANGE_TOOL_NAMES as readonly string[]).includes(name),
    )
    if (hasFileMutator) return true
    // Mixed / unknown tool sets that can write: isolate when possible.
    return allowed.some((name) => !READ_ONLY_TOOL_HINTS.has(name))
  }
  // Default for unrestricted parallel coding agents: isolate when possible.
  return true
}

export type SubAgentSpawnResult = {
  runId: string
  agentId: string
  agentName: string
  /** Settles without rejecting — check record.status / record.error. */
  promise: Promise<SubAgentRunRecord>
}

export type SubAgentRunRecord = {
  runId: string
  agentId: string
  agentName: string
  parentRunId: string
  rootRunId: string
  task: string
  status: SubAgentRunStatus
  result?: AgentRunResult
  error?: string
  childRun?: AgentRun
  /** Isolated git worktree path when created for this run. */
  worktreePath?: string
  worktreeBranch?: string
  /** Parent repo root used to create the worktree. */
  worktreeRepoRoot?: string
  /** `git diff --stat` vs base branch when worktree finished. */
  worktreeDiffStat?: string
}

/** Per-run wait payload for tools / parent LLM (never throws on sibling failure). */
export type SubAgentWaitResult = {
  runId: string
  agentId: string
  agentName: string
  status: SubAgentRunStatus
  /** @deprecated Prefer {@link summary} / brief fields. */
  report?: string
  summary?: string
  filesTouched?: string[]
  openQuestions?: string[]
  error?: string
  hitlPaused: boolean
  result?: AgentRunResult
  childRun?: AgentRun
  worktreePath?: string
  worktreeBranch?: string
}

type ActiveEntry = {
  record: SubAgentRunRecord
  promise: Promise<SubAgentRunRecord>
  abortController: AbortController
}

const activeByRunId = new Map<string, ActiveEntry>()
const completedByRunId = new Map<string, SubAgentRunRecord>()
const activeCountByParent = new Map<string, number>()

function emitLifecycle(
  parent: AgentRun,
  event: SubAgentRunLifecycleEvent,
): void {
  parent.context.opts.onSubAgentRunEvent?.(event)
  parent.context.opts.onUIMessageChunk?.({
    type: 'data-sub-agent-run',
    id: `sub-agent-${event.runId}-${event.kind}`,
    data: event,
  })
}

export function countActiveSubAgentsForParent(parentRunId: string): number {
  return activeCountByParent.get(parentRunId) ?? 0
}

export function remainingParallelSubAgentSlots(parentRunId: string): number {
  return Math.max(
    0,
    MAX_PARALLEL_SUB_AGENT_RUNS - countActiveSubAgentsForParent(parentRunId),
  )
}

function incrementParentCount(parentRunId: string): void {
  activeCountByParent.set(
    parentRunId,
    countActiveSubAgentsForParent(parentRunId) + 1,
  )
}

function decrementParentCount(parentRunId: string): void {
  const next = Math.max(0, countActiveSubAgentsForParent(parentRunId) - 1)
  if (next === 0) activeCountByParent.delete(parentRunId)
  else activeCountByParent.set(parentRunId, next)
}

function finishRecord(
  record: SubAgentRunRecord,
  status: SubAgentRunStatus,
  extras: { result?: AgentRunResult; error?: string } = {},
): SubAgentRunRecord {
  record.status = status
  if (extras.result) record.result = extras.result
  if (extras.error) record.error = extras.error
  return record
}

function combineAbortSignals(
  parentSignal: AbortSignal | undefined,
  childController: AbortController,
): AbortSignal {
  if (!parentSignal) return childController.signal
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([parentSignal, childController.signal])
  }
  if (parentSignal.aborted) {
    childController.abort(parentSignal.reason)
    return childController.signal
  }
  parentSignal.addEventListener(
    'abort',
    () => childController.abort(parentSignal.reason),
    { once: true },
  )
  return childController.signal
}

export async function spawnSubAgentRun(
  parent: AgentRun,
  params: ResolveChildAgentParams,
  opts: { waitMode?: 'blocking' | 'background'; detached?: boolean } = {},
): Promise<SubAgentSpawnResult> {
  if (parent.meta.depth > 0) {
    throw new Error('Only the root agent run may spawn sub-agents')
  }

  const parentRunId = parent.meta.runId
  if (countActiveSubAgentsForParent(parentRunId) >= MAX_PARALLEL_SUB_AGENT_RUNS) {
    throw new Error(
      `Parallel sub-agent limit reached (max ${MAX_PARALLEL_SUB_AGENT_RUNS})`,
    )
  }

  const agent = await resolveEngineAgent(
    parent.context.opts.userId,
    params.agentId,
  )
  const agentName = agent.name.trim() || agent.id

  const abortController = new AbortController()
  // Detached runs keep running after the parent finishes or is stopped.
  const combinedSignal = opts.detached
    ? abortController.signal
    : combineAbortSignals(
        params.parentOpts.abortSignal ?? parent.context.opts.abortSignal,
        abortController,
      )

  let workspacePathOverride = params.workspacePathOverride?.trim() || undefined
  let worktreePath: string | undefined
  let worktreeBranch: string | undefined
  let worktreeRepoRoot: string | undefined
  let preassignedRunId: string | undefined

  const conversationId =
    params.parentOpts.conversationId?.trim() ||
    parent.context.opts.conversationId?.trim()
  const parentWorkspace =
    (conversationId ? getWorkspacePath(conversationId) : null) || undefined

  if (
    !workspacePathOverride &&
    shouldIsolateGitWorktree(params) &&
    parentWorkspace &&
    isGitRepository(parentWorkspace)
  ) {
    preassignedRunId = createSubAgentRunId(params.agentId)
    const path = resolveSubAgentWorktreePath(preassignedRunId)
    const branch = subAgentWorktreeBranch(preassignedRunId)
    const added = await gitWorktreeAdd({
      repoRoot: parentWorkspace,
      worktreePath: path,
      branch,
    })
    if (!added.ok) {
      // Conflict policy: never fall back to the shared checkout for mutating agents.
      throw new Error(
        `Failed to create isolated git worktree for sub-agent: ${added.error}`,
      )
    }
    workspacePathOverride = added.path
    worktreePath = added.path
    worktreeBranch = added.branch
    worktreeRepoRoot = parentWorkspace
  } else if (
    !workspacePathOverride &&
    shouldIsolateGitWorktree(params) &&
    parentWorkspace &&
    !isGitRepository(parentWorkspace)
  ) {
    log.warn(
      'Sub-agent isolation requested but workspace is not a git repo; using shared workspace',
      { agentId: params.agentId, parentWorkspace },
    )
  }

  let child: AgentRun
  try {
    child = await AgentRun.createChild(
      parent,
      {
        ...params,
        workspacePathOverride,
        parentOpts: {
          ...params.parentOpts,
          abortSignal: combinedSignal,
        },
        onStepProgress: (payload) => {
          parent.context.opts.onStepProgress?.(payload)
        },
      },
      preassignedRunId ? { runId: preassignedRunId } : undefined,
    )
  } catch (err) {
    if (worktreePath && worktreeRepoRoot) {
      await gitWorktreeRemove({
        repoRoot: worktreeRepoRoot,
        worktreePath,
        force: true,
      })
      if (worktreeBranch) {
        await gitDeleteBranch(worktreeRepoRoot, worktreeBranch, true)
      }
    }
    throw err
  }
  const runId = child.meta.runId
  const rootRunId = parent.meta.runId
  // Spawn is always async; waitMode is UI/lifecycle metadata only.
  const waitMode = opts.waitMode ?? 'background'
  const detached = opts.detached === true

  const record: SubAgentRunRecord = {
    runId,
    agentId: params.agentId,
    agentName,
    parentRunId,
    rootRunId,
    task: params.task,
    status: 'running',
    childRun: child,
    worktreePath,
    worktreeBranch,
    worktreeRepoRoot,
  }

  emitLifecycle(parent, {
    kind: 'started',
    runId,
    parentRunId,
    rootRunId,
    agentId: params.agentId,
    agentName,
    task: params.task,
    waitMode,
    worktreePath,
    worktreeBranch,
    detached: detached || undefined,
  })

  incrementParentCount(parentRunId)

  const promise = (async (): Promise<SubAgentRunRecord> => {
    try {
      if (combinedSignal.aborted) {
        finishRecord(record, 'cancelled', {
          error: 'Sub-agent run aborted before start',
        })
        emitLifecycle(parent, {
          kind: 'finished',
          runId,
          parentRunId,
          rootRunId,
          agentId: params.agentId,
          agentName,
          status: 'cancelled',
          error: record.error,
          worktreePath,
          worktreeBranch,
          detached: detached || undefined,
        })
        return record
      }

      const result = await child.execute()

      let worktreeDiffStat: string | undefined
      if (worktreeRepoRoot && worktreeBranch && worktreePath) {
        await gitCommitAllIfDirty(
          worktreePath,
          `Sub-agent ${agentName}: ${params.task}`.slice(0, 72),
        )
        worktreeDiffStat = await gitWorktreeDiffStat(
          worktreeRepoRoot,
          worktreeBranch,
        )
      }

      if (result.hitlPaused) {
        finishRecord(record, 'awaiting_approval', { result })
        record.worktreeDiffStat = worktreeDiffStat
        emitLifecycle(parent, {
          kind: 'finished',
          runId,
          parentRunId,
          rootRunId,
          agentId: params.agentId,
          agentName,
          status: 'awaiting_approval',
          reportPreview: subAgentReportPreview(result.stepOutputs),
          worktreePath,
          worktreeBranch,
          worktreeDiffStat,
          detached: detached || undefined,
        })
        return record
      }

      finishRecord(record, 'completed', { result })
      record.worktreeDiffStat = worktreeDiffStat
      emitLifecycle(parent, {
        kind: 'finished',
        runId,
        parentRunId,
        rootRunId,
        agentId: params.agentId,
        agentName,
        status: 'completed',
        reportPreview: subAgentReportPreview(result.stepOutputs),
        worktreePath,
        worktreeBranch,
        worktreeDiffStat,
        detached: detached || undefined,
      })
      return record
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const cancelled =
        combinedSignal.aborted ||
        /abort/i.test(message) ||
        (err instanceof Error && err.name === 'AbortError')
      const status: SubAgentRunStatus = cancelled ? 'cancelled' : 'failed'
      log.warn('Sub-agent run ended', { runId, status, err })
      finishRecord(record, status, { error: message })
      emitLifecycle(parent, {
        kind: 'finished',
        runId,
        parentRunId,
        rootRunId,
        agentId: params.agentId,
        agentName,
        status,
        error: message,
        worktreePath,
        worktreeBranch,
        detached: detached || undefined,
      })
      // Settle without rejecting so wait=false never creates unhandled rejections.
      return record
    } finally {
      completedByRunId.set(runId, record)
      activeByRunId.delete(runId)
      decrementParentCount(parentRunId)
    }
  })()

  activeByRunId.set(runId, { record, promise, abortController })
  return { runId, agentId: params.agentId, agentName, promise }
}

export function getSubAgentRunRecord(
  runId: string,
): SubAgentRunRecord | undefined {
  const id = runId.trim()
  return activeByRunId.get(id)?.record ?? completedByRunId.get(id)
}

function toWaitResult(record: SubAgentRunRecord): SubAgentWaitResult {
  const brief = buildSubAgentBrief({
    runId: record.runId,
    agentId: record.agentId,
    agentName: record.agentName,
    status: record.status,
    stepOutputs: record.result?.stepOutputs,
    error: record.error,
    worktreePath: record.worktreePath,
    worktreeBranch: record.worktreeBranch,
    worktreeDiffStat: record.worktreeDiffStat,
  })
  return {
    runId: brief.runId,
    agentId: brief.agentId,
    agentName: brief.agentName,
    status: brief.status,
    report: brief.summary,
    summary: brief.summary,
    filesTouched: brief.filesTouched,
    openQuestions: brief.openQuestions,
    error: brief.error,
    hitlPaused:
      record.status === 'awaiting_approval' ||
      Boolean(record.result?.hitlPaused),
    result: record.result,
    childRun: record.childRun,
    worktreePath: brief.worktreePath,
    worktreeBranch: brief.worktreeBranch,
  }
}

/**
 * Wait for runs to settle. Never throws on sibling failure — returns per-run
 * status. Completed records stay available for a second wait (idempotent).
 */
export async function waitForSubAgentRuns(
  runIds: string[],
): Promise<SubAgentWaitResult[]> {
  const ids = runIds.map((id) => id.trim()).filter(Boolean)
  const results: SubAgentWaitResult[] = []
  for (const id of ids) {
    const entry = activeByRunId.get(id)
    if (entry) {
      const record = await entry.promise
      results.push(toWaitResult(record))
      continue
    }
    const completed = completedByRunId.get(id)
    if (completed) {
      results.push(toWaitResult(completed))
      continue
    }
    results.push({
      runId: id,
      agentId: '',
      agentName: '',
      status: 'failed',
      error: `Unknown sub-agent run: ${id}`,
      hitlPaused: false,
    })
  }
  return results
}

export function cancelSubAgentRun(runId: string): boolean {
  const id = runId.trim()
  const entry = activeByRunId.get(id)
  if (!entry) return false
  entry.abortController.abort()
  // Status / counts are finalized by the running promise's finally block.
  return true
}

export type SubAgentWorktreeActionResult =
  | { ok: true; message?: string; url?: string }
  | { ok: false; error: string }

function clearWorktreeFields(record: SubAgentRunRecord): void {
  record.worktreePath = undefined
  record.worktreeBranch = undefined
  record.worktreeRepoRoot = undefined
}

/** Update UI + registry when the user accepts/discards a paused or finished run. */
function settleRecordAfterWorktreeAction(
  record: SubAgentRunRecord,
  status: Extract<SubAgentRunStatus, 'completed' | 'cancelled'>,
): void {
  finishRecord(record, status)
  if (record.result) {
    record.result = { ...record.result, hitlPaused: false }
  }
  const child = record.childRun
  if (child?.context) {
    child.context.hitlAwaitingApproval = false
    child.context.hitlAwaitingFormData = false
    child.context.hitlAwaitingManualIntervention = false
  }
  const event: SubAgentRunLifecycleEvent = {
    kind: 'finished',
    runId: record.runId,
    parentRunId: record.parentRunId,
    rootRunId: record.rootRunId,
    agentId: record.agentId,
    agentName: record.agentName,
    status,
    reportPreview: record.result
      ? subAgentReportPreview(record.result.stepOutputs)
      : undefined,
    error: record.error,
  }
  const opts = child?.context?.opts
  opts?.onSubAgentRunEvent?.(event)
  opts?.onUIMessageChunk?.({
    type: 'data-sub-agent-run',
    id: `sub-agent-${event.runId}-finished`,
    data: event,
  })
}

/** Merge the sub-agent branch into the main checkout; removes the worktree. */
export async function mergeSubAgentWorktree(
  runId: string,
): Promise<SubAgentWorktreeActionResult> {
  const record = getSubAgentRunRecord(runId)
  if (!record?.worktreeRepoRoot || !record.worktreeBranch) {
    return { ok: false, error: 'No isolated worktree for this sub-agent run' }
  }
  if (record.status === 'running') {
    return { ok: false, error: 'Cannot merge while the sub-agent is still running' }
  }
  if (record.worktreePath) {
    const committed = await gitCommitAllIfDirty(
      record.worktreePath,
      `Sub-agent ${record.agentName}: ${record.task}`.slice(0, 72),
    )
    if (!committed.ok) {
      return { ok: false, error: committed.error }
    }
  }
  const merge = await gitMergeBranch(
    record.worktreeRepoRoot,
    record.worktreeBranch,
  )
  if (!merge.ok) return { ok: false, error: merge.error }
  if (record.worktreePath) {
    await gitWorktreeRemove({
      repoRoot: record.worktreeRepoRoot,
      worktreePath: record.worktreePath,
      force: true,
    })
  }
  const branch = record.worktreeBranch
  clearWorktreeFields(record)
  settleRecordAfterWorktreeAction(record, 'completed')
  return { ok: true, message: `Merged ${branch}` }
}

/** Discard worktree + branch without merging. */
export async function discardSubAgentWorktree(
  runId: string,
): Promise<SubAgentWorktreeActionResult> {
  const record = getSubAgentRunRecord(runId)
  if (!record?.worktreeRepoRoot) {
    return { ok: false, error: 'No isolated worktree for this sub-agent run' }
  }
  if (record.status === 'running') {
    const entry = activeByRunId.get(runId.trim())
    cancelSubAgentRun(runId)
    if (entry) await entry.promise
  }
  // Re-read in case status/path changed while cancelling.
  const latest = getSubAgentRunRecord(runId) ?? record
  if (!latest.worktreeRepoRoot) {
    return { ok: true, message: 'Discarded worktree' }
  }
  if (latest.worktreePath) {
    const removed = await gitWorktreeRemove({
      repoRoot: latest.worktreeRepoRoot,
      worktreePath: latest.worktreePath,
      force: true,
    })
    if (!removed.ok) return { ok: false, error: removed.error }
  }
  if (latest.worktreeBranch) {
    await gitDeleteBranch(latest.worktreeRepoRoot, latest.worktreeBranch, true)
  }
  clearWorktreeFields(latest)
  settleRecordAfterWorktreeAction(latest, 'cancelled')
  return { ok: true, message: 'Discarded worktree' }
}

/** Push the sub-agent branch and open a GitHub PR. */
export async function openPrForSubAgentWorktree(
  runId: string,
  opts: { title?: string; body?: string; base?: string; draft?: boolean } = {},
): Promise<SubAgentWorktreeActionResult> {
  const record = getSubAgentRunRecord(runId)
  if (!record?.worktreeRepoRoot || !record.worktreeBranch) {
    return { ok: false, error: 'No isolated worktree for this sub-agent run' }
  }
  if (record.status === 'running') {
    return { ok: false, error: 'Cannot open a PR while the sub-agent is still running' }
  }
  if (record.worktreePath) {
    const committed = await gitCommitAllIfDirty(
      record.worktreePath,
      `Sub-agent ${record.agentName}: ${record.task}`.slice(0, 72),
    )
    if (!committed.ok) {
      return { ok: false, error: committed.error }
    }
  }
  const push = await gitPush(record.worktreeRepoRoot, {
    remote: 'origin',
    branch: record.worktreeBranch,
    setUpstream: true,
  })
  if (!push.ok) return { ok: false, error: push.error }
  const title =
    opts.title?.trim() ||
    `Sub-agent: ${record.agentName || record.worktreeBranch}`
  const body =
    opts.body?.trim() ||
    record.task ||
    `Changes from sub-agent run \`${record.runId}\`.`
  const pr = await ghCreatePr(record.worktreeRepoRoot, {
    title,
    body,
    base: opts.base,
    draft: opts.draft,
  })
  if (!pr.ok) return { ok: false, error: pr.error }
  return { ok: true, url: pr.url, message: pr.url }
}

export function listSubAgentRunsByParent(
  parentRunId: string,
): SubAgentRunRecord[] {
  const active = [...activeByRunId.values()]
    .filter((e) => e.record.parentRunId === parentRunId)
    .map((e) => e.record)
  const completed = [...completedByRunId.values()].filter(
    (r) => r.parentRunId === parentRunId,
  )
  const byId = new Map<string, SubAgentRunRecord>()
  for (const r of [...completed, ...active]) byId.set(r.runId, r)
  return [...byId.values()]
}

/** All known sub-agent runs (active + completed) for dashboard / IPC. */
export function listAllSubAgentRuns(): SubAgentRunRecord[] {
  const byId = new Map<string, SubAgentRunRecord>()
  for (const e of activeByRunId.values()) byId.set(e.record.runId, e.record)
  for (const r of completedByRunId.values()) byId.set(r.runId, r)
  return [...byId.values()]
}

export function subAgentRunReport(record: SubAgentRunRecord): string {
  return buildSubAgentBrief({
    runId: record.runId,
    agentId: record.agentId,
    agentName: record.agentName,
    status: record.status,
    stepOutputs: record.result?.stepOutputs,
    error: record.error,
    worktreePath: record.worktreePath,
    worktreeBranch: record.worktreeBranch,
    worktreeDiffStat: record.worktreeDiffStat,
  }).summary
}

/** @internal Test helper */
export function clearSubAgentRunRegistryForTests(): void {
  activeByRunId.clear()
  completedByRunId.clear()
  activeCountByParent.clear()
}
