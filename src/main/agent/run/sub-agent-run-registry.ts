import { createLogger } from '@main/logger'
import type { SubAgentRunLifecycleEvent, SubAgentRunStatus } from '../types'
import { AgentRun } from './agent-run'
import {
  mergeSubFlowOutputText,
  resolveEngineAgent,
  subAgentReportPreview,
  type ResolveChildAgentParams,
} from './resolve-child-agent'
import type { AgentRunResult } from './types'
import { MAX_PARALLEL_SUB_AGENT_RUNS } from './types'

const log = createLogger('agent.subAgentRegistry')

export type SubAgentSpawnResult = {
  runId: string
  agentId: string
  agentName: string
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
}

type ActiveEntry = {
  record: SubAgentRunRecord
  promise: Promise<SubAgentRunRecord>
  abortController?: AbortController
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

function countActiveForParent(parentRunId: string): number {
  return activeCountByParent.get(parentRunId) ?? 0
}

function incrementParentCount(parentRunId: string): void {
  activeCountByParent.set(
    parentRunId,
    countActiveForParent(parentRunId) + 1,
  )
}

function decrementParentCount(parentRunId: string): void {
  const next = Math.max(0, countActiveForParent(parentRunId) - 1)
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

export async function spawnSubAgentRun(
  parent: AgentRun,
  params: ResolveChildAgentParams,
  opts: { waitMode?: 'blocking' | 'background' } = {},
): Promise<SubAgentSpawnResult> {
  if (parent.meta.depth > 0) {
    throw new Error('Only the root agent run may spawn sub-agents')
  }

  const parentRunId = parent.meta.runId
  if (countActiveForParent(parentRunId) >= MAX_PARALLEL_SUB_AGENT_RUNS) {
    throw new Error(
      `Parallel sub-agent limit reached (max ${MAX_PARALLEL_SUB_AGENT_RUNS})`,
    )
  }

  const agent = await resolveEngineAgent(parent.context.opts.userId, params.agentId)
  const agentName = agent.name.trim() || agent.id
  const child = await parent.forkChild({
    ...params,
    onStepProgress: (payload) => {
      parent.context.opts.onStepProgress?.(payload)
    },
  })
  const runId = child.meta.runId
  const rootRunId = parent.meta.runId
  const waitMode = opts.waitMode ?? 'background'

  const record: SubAgentRunRecord = {
    runId,
    agentId: params.agentId,
    agentName,
    parentRunId,
    rootRunId,
    task: params.task,
    status: 'running',
    childRun: child,
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
  })

  incrementParentCount(parentRunId)

  const promise = (async (): Promise<SubAgentRunRecord> => {
    try {
      const result = await child.execute()

      if (result.hitlPaused) {
        finishRecord(record, 'awaiting_approval', { result })
        emitLifecycle(parent, {
          kind: 'finished',
          runId,
          parentRunId,
          rootRunId,
          agentId: params.agentId,
          agentName,
          status: 'awaiting_approval',
          reportPreview: subAgentReportPreview(result.stepOutputs),
        })
        return record
      }

      finishRecord(record, 'completed', { result })
      emitLifecycle(parent, {
        kind: 'finished',
        runId,
        parentRunId,
        rootRunId,
        agentId: params.agentId,
        agentName,
        status: 'completed',
        reportPreview: subAgentReportPreview(result.stepOutputs),
      })
      return record
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn('Sub-agent run failed', { runId, err })
      finishRecord(record, 'failed', { error: message })
      emitLifecycle(parent, {
        kind: 'finished',
        runId,
        parentRunId,
        rootRunId,
        agentId: params.agentId,
        agentName,
        status: 'failed',
        error: message,
      })
      throw err
    } finally {
      completedByRunId.set(runId, record)
      activeByRunId.delete(runId)
      decrementParentCount(parentRunId)
    }
  })()

  activeByRunId.set(runId, { record, promise })
  return { runId, agentId: params.agentId, agentName, promise }
}

export function getSubAgentRunRecord(runId: string): SubAgentRunRecord | undefined {
  return activeByRunId.get(runId.trim())?.record
}

export async function waitForSubAgentRuns(
  runIds: string[],
): Promise<SubAgentRunRecord[]> {
  const ids = runIds.map((id) => id.trim()).filter(Boolean)
  const results: SubAgentRunRecord[] = []
  for (const id of ids) {
    const entry = activeByRunId.get(id)
    if (entry) {
      results.push(await entry.promise)
      completedByRunId.delete(id)
      continue
    }
    const completed = completedByRunId.get(id)
    if (completed) {
      completedByRunId.delete(id)
      results.push(completed)
      continue
    }
    throw new Error(`Unknown or completed sub-agent run: ${id}`)
  }
  return results
}

export function cancelSubAgentRun(runId: string): boolean {
  const entry = activeByRunId.get(runId.trim())
  if (!entry) return false
  entry.abortController?.abort()
  finishRecord(entry.record, 'cancelled')
  activeByRunId.delete(runId.trim())
  return true
}

export function listSubAgentRunsByParent(parentRunId: string): SubAgentRunRecord[] {
  return [...activeByRunId.values()]
    .filter((e) => e.record.parentRunId === parentRunId)
    .map((e) => e.record)
}

export function subAgentRunReport(record: SubAgentRunRecord): string {
  if (record.result) {
    return mergeSubFlowOutputText(record.result.stepOutputs, 'report')
  }
  return record.error ?? 'Sub-agent run did not produce a report.'
}

/** @internal Test helper */
export function clearSubAgentRunRegistryForTests(): void {
  activeByRunId.clear()
  completedByRunId.clear()
  activeCountByParent.clear()
}
