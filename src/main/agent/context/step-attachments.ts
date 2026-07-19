import { fileURLToPath } from 'node:url'
import type { AgentStepContext as AgentStepSnapshot } from '../types'
import type { FlowStageId } from '../constants/step-ids'
import {
  SKILLS_STEP_ID,
  TOOL_LOOP_STEP_ID,
} from '../constants/step-ids'
import { collectOutputLinksForStep } from '../sandbox/step-output-links'
import type { ReferenceContext } from '../resources/context'
import type { SandboxContext } from '../sandbox/context'
import {
  dedupeStepAttachments,
  mergeStepAttachments,
  type StepAttachment,
} from '@shared/agent/step-attachment'

export type StepAttachmentsStore = Map<string, StepAttachment[]>

export function getStepAttachments(
  store: StepAttachmentsStore,
  stepKey: string,
): StepAttachment[] {
  return [...(store.get(stepKey) ?? [])]
}

export function appendStepAttachments(
  store: StepAttachmentsStore,
  stepKey: string,
  items: readonly StepAttachment[],
): void {
  if (!items.length) return
  const merged = mergeStepAttachments(store.get(stepKey) ?? [], items)
  store.set(stepKey, merged)
}

/** Output files produced by the latest completed tool-loop run for a todo. */
export function getToolLoopAttachmentsForTodo(
  steps: readonly AgentStepSnapshot[],
  store: StepAttachmentsStore,
  todoId: number,
): StepAttachment[] {
  const matching = steps.filter(
    (s) =>
      s.stepId === TOOL_LOOP_STEP_ID &&
      Boolean(s.completedAt) &&
      s.meta?.todoId === todoId,
  )
  if (matching.length === 0) return []
  return getStepAttachments(store, matching[matching.length - 1]!.key)
}

/** Union tool-loop attachments (includes per-todo child runs) for structured captures. */
export function getAggregatedAttachmentsForStage(
  stepHistory: readonly AgentStepSnapshot[],
  store: StepAttachmentsStore,
  stageId: FlowStageId,
): StepAttachment[] {
  if (stageId === TOOL_LOOP_STEP_ID || stageId === SKILLS_STEP_ID) {
    let merged: StepAttachment[] = []
    for (const step of stepHistory) {
      if (step.stepId !== TOOL_LOOP_STEP_ID) continue
      merged = mergeStepAttachments(merged, getStepAttachments(store, step.key))
    }
    return merged
  }
  let merged: StepAttachment[] = []
  for (const step of stepHistory) {
    if (step.stepId !== stageId) continue
    merged = mergeStepAttachments(merged, getStepAttachments(store, step.key))
  }
  return merged
}

export function appendScanLinksToAttachments(
  attachments: readonly StepAttachment[],
  scanLinks: Array<{ label: string; url: string }>,
): StepAttachment[] {
  let merged = [...attachments]
  const seenPaths = new Set(
    merged.map((a) => a.path.replace(/\\/g, '/').toLowerCase()),
  )
  for (const link of scanLinks) {
    let absPath: string | undefined
    try {
      absPath = fileURLToPath(link.url)
    } catch {
      continue
    }
    const key = absPath.replace(/\\/g, '/').toLowerCase()
    if (seenPaths.has(key)) continue
    seenPaths.add(key)
    merged = mergeStepAttachments(merged, [
      {
        path: absPath,
        label: link.label,
        url: link.url,
      },
    ])
  }
  return dedupeStepAttachments(merged)
}

export function mergeAttachmentsWithScanLinks(
  store: StepAttachmentsStore,
  stepContext: AgentStepSnapshot,
  scanLinks: Array<{ label: string; url: string }>,
): StepAttachment[] {
  const attachments = getStepAttachments(store, stepContext.key)
  return appendScanLinksToAttachments(attachments, scanLinks)
}

export type MergeToolLoopAttachmentsHost = {
  stepHistory: readonly AgentStepSnapshot[]
  stepAttachmentsByKey: StepAttachmentsStore
  sandbox: SandboxContext
  references: ReferenceContext
  publishStepProgress: (step: AgentStepSnapshot) => void
}

export function mergeToolLoopAttachmentsIntoParent(
  host: MergeToolLoopAttachmentsHost,
  parentStepKey: string,
): void {
  const parent = host.stepHistory.find((s) => s.key === parentStepKey)
  if (!parent) return

  let merged = getStepAttachments(host.stepAttachmentsByKey, parentStepKey)

  for (const step of host.stepHistory) {
    if (step.stepId !== TOOL_LOOP_STEP_ID) continue
    if (step.key === parentStepKey) continue
    merged = mergeStepAttachments(
      merged,
      getStepAttachments(host.stepAttachmentsByKey, step.key),
    )
    merged = appendScanLinksToAttachments(
      merged,
      collectOutputLinksForStep(step, host.sandbox, host.references),
    )
  }

  merged = appendScanLinksToAttachments(
    merged,
    collectOutputLinksForStep(parent, host.sandbox, host.references),
  )

  if (merged.length === 0) return
  host.stepAttachmentsByKey.set(parentStepKey, merged)
  host.publishStepProgress(parent)
}
