import type { UIMessage } from '@teralexi-ai'
import type { StepProgressPartInput } from '../../structuredDebugViewModel'

export type SubAgentRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'awaiting_approval'

export type SubAgentRunLifecyclePart = {
  kind: 'started' | 'finished'
  runId: string
  parentRunId?: string
  rootRunId?: string
  agentId: string
  agentName: string
  task?: string
  waitMode?: 'blocking' | 'background'
  status?: SubAgentRunStatus
  profile?: string
  reportPreview?: string
  error?: string
  worktreePath?: string
  worktreeBranch?: string
  worktreeDiffStat?: string
  detached?: boolean
}

export type SubAgentRunNode = {
  runId: string
  parentRunId?: string
  rootRunId?: string
  agentId: string
  agentName: string
  task: string
  status: SubAgentRunStatus
  profile?: string
  reportPreview: string
  error?: string
  depth: number
  children: SubAgentRunNode[]
  worktreePath?: string
  worktreeBranch?: string
  worktreeDiffStat?: string
  detached?: boolean
}

export const SUB_AGENT_UI_MAX_DEPTH = 2

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function extractSubAgentLifecycleParts(
  message: UIMessage,
): SubAgentRunLifecyclePart[] {
  const out: SubAgentRunLifecyclePart[] = []
  for (const part of message.parts) {
    if ((part as { type?: string }).type !== 'data-sub-agent-run') continue
    const data = asRecord((part as { data?: unknown }).data)
    if (!data || typeof data.kind !== 'string') continue
    const runId = typeof data.runId === 'string' ? data.runId.trim() : ''
    const agentId = typeof data.agentId === 'string' ? data.agentId.trim() : ''
    const agentName =
      typeof data.agentName === 'string' ? data.agentName.trim() : agentId
    if (!runId || !agentId) continue
    if (data.kind === 'started') {
      out.push({
        kind: 'started',
        runId,
        parentRunId:
          typeof data.parentRunId === 'string' ? data.parentRunId : undefined,
        rootRunId:
          typeof data.rootRunId === 'string' ? data.rootRunId : undefined,
        agentId,
        agentName,
        task: typeof data.task === 'string' ? data.task : '',
        waitMode:
          data.waitMode === 'background' || data.waitMode === 'blocking'
            ? data.waitMode
            : undefined,
        profile: typeof data.profile === 'string' ? data.profile : undefined,
        worktreePath:
          typeof data.worktreePath === 'string' ? data.worktreePath : undefined,
        worktreeBranch:
          typeof data.worktreeBranch === 'string'
            ? data.worktreeBranch
            : undefined,
        detached: data.detached === true,
      })
    } else if (data.kind === 'finished') {
      out.push({
        kind: 'finished',
        runId,
        parentRunId:
          typeof data.parentRunId === 'string' ? data.parentRunId : undefined,
        rootRunId:
          typeof data.rootRunId === 'string' ? data.rootRunId : undefined,
        agentId,
        agentName,
        status: typeof data.status === 'string' ? (data.status as SubAgentRunStatus) : 'completed',
        profile: typeof data.profile === 'string' ? data.profile : undefined,
        reportPreview:
          typeof data.reportPreview === 'string' ? data.reportPreview : undefined,
        error: typeof data.error === 'string' ? data.error : undefined,
        worktreePath:
          typeof data.worktreePath === 'string' ? data.worktreePath : undefined,
        worktreeBranch:
          typeof data.worktreeBranch === 'string'
            ? data.worktreeBranch
            : undefined,
        worktreeDiffStat:
          typeof data.worktreeDiffStat === 'string'
            ? data.worktreeDiffStat
            : undefined,
        detached: data.detached === true,
      })
    }
  }
  return out
}

export function buildSubAgentRunTree(
  message: UIMessage,
): SubAgentRunNode[] {
  const lifecycle = extractSubAgentLifecycleParts(message)
  const byRunId = new Map<string, SubAgentRunNode>()

  for (const event of lifecycle) {
    if (event.kind === 'started') {
      byRunId.set(event.runId, {
        runId: event.runId,
        parentRunId: event.parentRunId,
        rootRunId: event.rootRunId,
        agentId: event.agentId,
        agentName: event.agentName,
        task: event.task ?? '',
        status: 'running',
        profile: event.profile,
        reportPreview: '',
        depth: 0,
        children: [],
        worktreePath: event.worktreePath,
        worktreeBranch: event.worktreeBranch,
        detached: event.detached,
      })
    } else if (event.kind === 'finished') {
      const node = byRunId.get(event.runId) ?? {
        runId: event.runId,
        parentRunId: event.parentRunId,
        rootRunId: event.rootRunId,
        agentId: event.agentId,
        agentName: event.agentName,
        task: '',
        status: 'completed' as SubAgentRunStatus,
        profile: event.profile,
        reportPreview: '',
        depth: 0,
        children: [],
      }
      node.status = event.status ?? 'completed'
      if (event.profile) node.profile = event.profile
      if (event.reportPreview) node.reportPreview = event.reportPreview
      if (event.error) node.error = event.error
      if (event.worktreePath) node.worktreePath = event.worktreePath
      if (event.worktreeBranch) node.worktreeBranch = event.worktreeBranch
      if (event.worktreeDiffStat) node.worktreeDiffStat = event.worktreeDiffStat
      if (event.detached) node.detached = true
      byRunId.set(event.runId, node)
    }
  }

  const roots: SubAgentRunNode[] = []
  for (const node of byRunId.values()) {
    const parentId = node.parentRunId?.trim()
    const parent = parentId ? byRunId.get(parentId) : undefined
    if (parent && parent.runId !== node.runId) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  function assignDepth(node: SubAgentRunNode, depth: number): void {
    node.depth = depth
    for (const child of node.children) {
      assignDepth(child, depth + 1)
    }
  }
  for (const root of roots) assignDepth(root, 1)

  return roots
}

export function stepProgressPartsForRun(
  parts: readonly StepProgressPartInput[],
  runId: string,
): StepProgressPartInput[] {
  const id = runId.trim()
  return parts.filter((part) => {
    const data = asRecord(part.data)
    return data?.runId === id
  })
}

export function flattenSubAgentRunsForDisplay(
  roots: SubAgentRunNode[],
  maxDepth = SUB_AGENT_UI_MAX_DEPTH,
): SubAgentRunNode[] {
  const out: SubAgentRunNode[] = []
  function walk(node: SubAgentRunNode): void {
    out.push(node)
    if (node.depth >= maxDepth) return
    for (const child of node.children) walk(child)
  }
  for (const root of roots) walk(root)
  return out
}

export function hasSubAgentRuns(message: UIMessage): boolean {
  return buildSubAgentRunTree(message).length > 0
}

/** Group completed sibling runs that share the same task (best-of-N). */
export function groupBestOfNCandidates(
  nodes: readonly SubAgentRunNode[],
): SubAgentRunNode[][] {
  const byTask = new Map<string, SubAgentRunNode[]>()
  for (const node of nodes) {
    const task = node.task.trim()
    // Require worktree isolation so sequential same-task runs don't look like BoN.
    if (!task || !node.worktreeBranch) continue
    const list = byTask.get(task) ?? []
    list.push(node)
    byTask.set(task, list)
  }
  return [...byTask.values()].filter((group) => group.length >= 2)
}
