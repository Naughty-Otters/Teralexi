import { stepHasPdfAttachment } from '@shared/agent/step-attachment'
import type { AgentStepId, PipelineConversationTurn } from './types'
import type { AgentFlowContext } from './context'
import { CREATE_PAPER_STEP_ID } from './constants/step-ids'

/** Bubble section id used in the conversation chat layout. */
export function pipelineSectionIdForStep(stepId: AgentStepId): string {
  if (stepId === 'createPaper') return 'researchReport'
  if (stepId === 'toolLoop' || stepId === 'foreachItem') return 'SkillsToolExecutionStep'
  if (stepId === 'thinking') return 'ThinkingStep'
  if (stepId === 'planning') return 'PlanningStep'
  if (stepId === 'summary') return 'SummaryStep'
  if (stepId === 'report') return 'ReportStep'
  if (stepId === 'search') return 'SearchStep'
  if (stepId === 'webScrape') return 'WebScrapeStep'
  return stepId
}

function shouldPersistPipelineTurn(
  ctx: AgentFlowContext,
  step: { stepId: AgentStepId; key: string; title: string; meta?: Record<string, unknown> },
): boolean {
  if (step.stepId === 'collectFormData') return false
  if (step.stepId === 'foreachItem' && typeof step.meta?.todoId === 'number') {
    return false
  }
  if (step.stepId === 'toolLoop') {
    if (step.meta?.suppressToolLoopUi === true) return false
    if (typeof step.meta?.todoId === 'number') return false
  }
  const parentKey = ctx.stepContexts['toolLoop']?.key
  if (
    step.stepId === 'toolLoop' &&
    parentKey &&
    step.key !== parentKey
  ) {
    return false
  }
  return true
}

/** Reconstruct conversation bubbles from completed pipeline steps (for DB reload). */
export function buildPipelineConversationTurns(
  ctx: AgentFlowContext,
): PipelineConversationTurn[] {
  const turns: PipelineConversationTurn[] = []

  for (const step of ctx.listCompletedStepsForPersistence()) {
    if (!shouldPersistPipelineTurn(ctx, step)) continue

    const content = ctx.getStepProgressText(step.key).trim()
    const attachments = ctx.getStepAttachments(step.key)
    const hasPdf = stepHasPdfAttachment(attachments)

    if (!content && !hasPdf && attachments.length === 0) continue

    turns.push({
      sectionId: pipelineSectionIdForStep(step.stepId),
      stepId: step.stepId,
      title:
        step.stepId === CREATE_PAPER_STEP_ID ? 'Research Report' : step.title,
      content,
      status: 'completed',
      ...(attachments.length ? { attachments } : {}),
      stepKey: step.key,
      sequence: step.sequence,
    })
  }

  const visibleToolLoopKey = ctx.stepContexts['toolLoop']?.key
  if (
    visibleToolLoopKey &&
    !turns.some((turn) => turn.stepKey === visibleToolLoopKey)
  ) {
    const attachments = ctx.getStepAttachments(visibleToolLoopKey)
    const content = ctx.getStepProgressText(visibleToolLoopKey).trim()
    const hasPdf = stepHasPdfAttachment(attachments)
    if (content || hasPdf || attachments.length > 0) {
      turns.push({
        sectionId: pipelineSectionIdForStep('toolLoop'),
        stepId: 'toolLoop',
        title: ctx.stepContexts['toolLoop']?.title ?? 'Agentic Run',
        content,
        status: 'completed',
        ...(attachments.length ? { attachments } : {}),
        stepKey: visibleToolLoopKey,
        sequence: ctx.stepContexts['toolLoop']?.sequence ?? turns.length,
      })
    }
  }

  return turns
}
