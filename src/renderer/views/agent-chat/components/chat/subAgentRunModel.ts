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
  reportPreview?: string
  error?: string
}

export type SubAgentRunNode = {
  runId: string
  parentRunId?: string
  rootRunId?: string
  agentId: string
  agentName: string
  task: string
  status: SubAgentRunStatus
  reportPreview: string
  error?: string
  depth: number
  children: SubAgentRunNode[]
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
        reportPreview:
          typeof data.reportPreview === 'string' ? data.reportPreview : undefined,
        error: typeof data.error === 'string' ? data.error : undefined,
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
        reportPreview: '',
        depth: 0,
        children: [],
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
        reportPreview: '',
        depth: 0,
        children: [],
      }
      node.status = event.status ?? 'completed'
      if (event.reportPreview) node.reportPreview = event.reportPreview
      if (event.error) node.error = event.error
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
