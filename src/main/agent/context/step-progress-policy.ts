import { limitPersistedStepText } from '@shared/persistence/limit-persisted-content'
import type {
  AgentResponseOpts,
  AgentStepContext as AgentStepSnapshot,
  AgentStepContextMap,
  AgentStepId,
  AgentStepProgressPayload,
} from '../types'
import {
  FOREACH_ITEM_STEP_ID,
  TOOL_LOOP_STEP_ID,
  TOOL_LOOP_STEP_TITLE,
} from '../constants/step-ids'
import {
  isAgenticRunPerTaskStepTitle,
} from '@shared/agent/agentic-run-labels'
import { getCurrentAgentRunScope } from '../run/run-scope'
import {
  getStepAttachments,
  type StepAttachmentsStore,
} from './step-attachments'

export type StepProgressTextStore = Map<string, string>

export function isPerTaskToolLoopStep(step: AgentStepSnapshot): boolean {
  if (step.stepId !== TOOL_LOOP_STEP_ID) return false
  if (step.meta?.suppressToolLoopUi === true) return true
  if (typeof step.meta?.todoId === 'number') return true
  return isAgenticRunPerTaskStepTitle(step.title)
}

/** Only the batch parent agentic-run row is streamed; per-todo attempts stay internal. */
export function shouldRegisterToolLoopStepContext(
  stepId: AgentStepId,
  title: string,
  meta?: Record<string, unknown>,
): boolean {
  if (stepId !== TOOL_LOOP_STEP_ID) return true
  if (meta?.suppressToolLoopUi === true) return false
  if (typeof meta?.todoId === 'number') return false
  return title.trim() === TOOL_LOOP_STEP_TITLE
}

/** Per-todo foreach shells (title = task name); orchestration stays on the parent Agentic Run stream. */
export function isPerTaskForeachItemStep(step: AgentStepSnapshot): boolean {
  return (
    step.stepId === FOREACH_ITEM_STEP_ID &&
    typeof step.meta?.todoId === 'number'
  )
}

export function shouldPublishStepProgress(
  stepContexts: AgentStepContextMap,
  stepContext: AgentStepSnapshot,
): boolean {
  if (isPerTaskForeachItemStep(stepContext)) return false
  if (isPerTaskToolLoopStep(stepContext)) return false
  const parentKey = stepContexts[TOOL_LOOP_STEP_ID]?.key
  if (
    stepContext.stepId === TOOL_LOOP_STEP_ID &&
    parentKey &&
    stepContext.key !== parentKey
  ) {
    return false
  }
  return true
}

export function buildStepProgressPayload(
  host: {
    flowId: string
    lastHitlPausedStageId?: string
    stepProgressTextByKey: StepProgressTextStore
    stepAttachmentsByKey: StepAttachmentsStore
  },
  stepContext: AgentStepSnapshot,
): AgentStepProgressPayload {
  const attachments = getStepAttachments(
    host.stepAttachmentsByKey,
    stepContext.key,
  )
  const runScope = getCurrentAgentRunScope()
  const flowId = runScope?.runId ?? host.flowId
  return {
    stepKey: stepContext.key,
    stepId: stepContext.stepId,
    title: stepContext.title,
    sequence: stepContext.sequence,
    content: host.stepProgressTextByKey.get(stepContext.key) ?? '',
    status: stepContext.completedAt ? 'completed' : 'running',
    goal: stepContext.goal,
    summary: stepContext.summary,
    ...(attachments.length ? { attachments } : {}),
    ...(flowId ? { runId: flowId, flowId } : {}),
    ...(runScope?.parentRunId ? { parentRunId: runScope.parentRunId } : {}),
    ...(host.lastHitlPausedStageId
      ? { scopedStageId: host.lastHitlPausedStageId }
      : {}),
  }
}

export function publishStepProgress(
  host: {
    opts: AgentResponseOpts
    stepContexts: AgentStepContextMap
    flowId: string
    lastHitlPausedStageId?: string
    stepProgressTextByKey: StepProgressTextStore
    stepAttachmentsByKey: StepAttachmentsStore
  },
  stepContext: AgentStepSnapshot,
): void {
  if (!shouldPublishStepProgress(host.stepContexts, stepContext)) return
  host.opts.onStepProgress?.(buildStepProgressPayload(host, stepContext))
}

/**
 * Per-todo tool-loop steps are not streamed directly; mirror their progress
 * onto the batch parent so live IPC/UI updates stay visible.
 */
export function resolvePublishStepProgressTarget(
  host: {
    stepContexts: AgentStepContextMap
    stepProgressTextByKey: StepProgressTextStore
  },
  stepContext: AgentStepSnapshot,
  chunk: string,
): AgentStepSnapshot | null {
  if (shouldPublishStepProgress(host.stepContexts, stepContext)) {
    return stepContext
  }
  const parent = host.stepContexts[TOOL_LOOP_STEP_ID]
  if (!parent || parent.key === stepContext.key) return null
  if (!shouldPublishStepProgress(host.stepContexts, parent)) return null
  const parentNext = limitPersistedStepText(
    (host.stepProgressTextByKey.get(parent.key) ?? '') + chunk,
  )
  host.stepProgressTextByKey.set(parent.key, parentNext)
  return parent
}

type StepProgressHost = {
  opts: AgentResponseOpts
  stepHistory: AgentStepSnapshot[]
  stepContexts: AgentStepContextMap
  stepProgressTextByKey: StepProgressTextStore
  stepAttachmentsByKey: StepAttachmentsStore
  flowId: string
  lastHitlPausedStageId?: string
  getLatestStepContext: () => AgentStepSnapshot | undefined
}

function resolveStepProgressTarget(
  host: StepProgressHost,
  stepId?: AgentStepId,
  instanceKey?: string,
): AgentStepSnapshot | undefined {
  let target = instanceKey
    ? host.stepHistory.find((step) => step.key === instanceKey)
    : stepId
      ? host.stepContexts[stepId] ??
        host.stepHistory.find((step) => step.stepId === stepId)
      : host.getLatestStepContext()
  if (!target && host.opts.onStepProgress && host.stepHistory.length > 0) {
    target = host.getLatestStepContext()
  }
  return target
}

export function emitStepProgress(
  host: StepProgressHost,
  chunk: string,
  stepId?: AgentStepId,
  instanceKey?: string,
): void {
  if (!chunk) return
  const target = resolveStepProgressTarget(host, stepId, instanceKey)
  if (!target || !host.opts.onStepProgress) {
    host.opts.onChunk(chunk)
    return
  }
  const next = limitPersistedStepText(
    (host.stepProgressTextByKey.get(target.key) ?? '') + chunk,
  )
  host.stepProgressTextByKey.set(target.key, next)
  const publishTarget = resolvePublishStepProgressTarget(host, target, chunk)
  if (!publishTarget) return
  publishStepProgress(host, publishTarget)
}

/** Replace (do not append) the live step-progress body and republish. */
export function setStepProgressContent(
  host: StepProgressHost,
  content: string,
  stepId?: AgentStepId,
  instanceKey?: string,
): void {
  const target = resolveStepProgressTarget(host, stepId, instanceKey)
  if (!target || !host.opts.onStepProgress) {
    if (content) host.opts.onChunk(content)
    return
  }
  host.stepProgressTextByKey.set(target.key, limitPersistedStepText(content))
  const publishTarget = resolvePublishStepProgressTarget(host, target, content)
  if (!publishTarget) return
  publishStepProgress(host, publishTarget)
}
