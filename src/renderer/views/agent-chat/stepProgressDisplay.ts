import {
  AGENTIC_RUN_STEP_TITLE,
  isAgenticRunParentStepTitle,
  isAgenticRunPerTaskStepTitle,
} from '@shared/agent/agentic-run-labels'

export type AgentStepProgressData = {
  stepKey?: string
  stepId?: string
  title?: string
  sequence?: number
  status?: string
  content?: string
  runId?: string
  parentRunId?: string
}

export function stepProgressSequence(data: AgentStepProgressData): number {
  const seq = data.sequence
  return typeof seq === 'number' && Number.isFinite(seq) ? seq : -1
}

export function stepProgressPartKey(
  part: { id?: string; data?: AgentStepProgressData },
): string {
  const id = typeof part.id === 'string' ? part.id.trim() : ''
  if (id) return id
  const stepKey = part.data?.stepKey
  return typeof stepKey === 'string' ? stepKey.trim() : ''
}

export function agentStepProgressStepId(data: AgentStepProgressData): string {
  const stepId = data.stepId
  return typeof stepId === 'string' ? stepId.trim() : ''
}

/** Live step progress forwarded from a nested sub-agent run (shown in sub-agent bubbles only). */
export function isSubAgentStepProgressPart(part: {
  data?: AgentStepProgressData
}): boolean {
  const parentRunId = part.data?.parentRunId
  return typeof parentRunId === 'string' && parentRunId.trim().length > 0
}

export function excludeSubAgentStepProgressParts<
  T extends { data?: AgentStepProgressData },
>(parts: readonly T[]): T[] {
  return parts.filter((part) => !isSubAgentStepProgressPart(part))
}

/** Per-todo agentic-run attempt rows (hidden when parent section is shown). */
export function isPerTaskToolLoopProgress(data: AgentStepProgressData): boolean {
  if (agentStepProgressStepId(data) !== 'toolLoop') return false
  return isAgenticRunPerTaskStepTitle(data.title)
}

/** Per-todo foreach rows (task name as title); content is mirrored on the parent Agentic Run stream. */
export function isPerTaskForeachItemProgress(data: AgentStepProgressData): boolean {
  if (agentStepProgressStepId(data) !== 'foreachItem') return false
  const title = (data.title ?? '').trim()
  if (!title || title === 'For Each Item' || title === 'Executing') return false
  return true
}

/** Parent batch shell from execute() that never received content — not a real in-flight step. */
export function isStaleEmptyToolLoopShell(data: AgentStepProgressData): boolean {
  if (agentStepProgressStepId(data) !== 'toolLoop') return false
  if (!isAgenticRunParentStepTitle(data.title)) return false
  return !(data.content ?? '').trim()
}

export { AGENTIC_RUN_STEP_TITLE }

const FINISHED_STEP_DISPLAY_PRIORITY = [
  'toolLoop',
  'thinking',
] as const

function latestStepProgressPartKey<T extends { id?: string; data?: AgentStepProgressData }>(
  parts: T[],
): string | null {
  if (parts.length === 0) return null
  const latest = parts.reduce((best, part) =>
    stepProgressSequence(part.data ?? {}) >= stepProgressSequence(best.data ?? {})
      ? part
      : best,
  )
  const key = stepProgressPartKey(latest)
  return key || null
}

export function messageHasRunningStep<T extends { data?: AgentStepProgressData }>(
  parts: T[],
): boolean {
  return parts.some((part) => {
    const data = part.data ?? {}
    return data.status !== 'completed' && !isStaleEmptyToolLoopShell(data)
  })
}

export function activeStepProgressPartKey<T extends { id?: string; data?: AgentStepProgressData }>(
  parts: T[],
): string | null {
  const running = parts.filter((part) => {
    const data = part.data ?? {}
    return data.status !== 'completed' && !isStaleEmptyToolLoopShell(data)
  })
  if (running.length > 0) return latestStepProgressPartKey(running)

  for (const stepId of FINISHED_STEP_DISPLAY_PRIORITY) {
    const matches = parts.filter(
      (part) => agentStepProgressStepId(part.data ?? {}) === stepId,
    )
    if (matches.length > 0) return latestStepProgressPartKey(matches)
  }
  return latestStepProgressPartKey(parts)
}

export function agentStepProgressShouldBeOpen<T extends { id?: string; data?: AgentStepProgressData }>(
  parts: T[],
  part: T,
  opts?: { debugMode?: boolean },
): boolean {
  const activeKey = activeStepProgressPartKey(parts)
  const partKey = stepProgressPartKey(part)
  if (!activeKey || partKey !== activeKey) return false

  if (messageHasRunningStep(parts)) return true

  // Pipeline finished: keep the visible step open in compact mode only.
  return opts?.debugMode !== true
}
