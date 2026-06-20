import type { AgentStepContext } from '../context'
import { skillIsCodingAgent } from '@shared/agent/coding-agent'
import { getCodingModeForConversation } from './coding-agent-policy'
import { clearExploreManifest } from './explore-manifest'
import { hasPersistedPlanTodos } from './plan-mode-execution-bridge'
import {
  bootstrapPlanModeStorage,
  isPlanExecutionActive,
  isPlanModeActive,
  planModeFor,
  planModeStorageOptionsFromEnv,
} from './plan-mode-state'
import { classifyTaskComplexity } from '../expr/task-complexity-router'
import { hasRecentPlanExecutionCompleted } from './plan-mode-session-reminders'
import { isSubAgentAgentRun } from '../run/sub-agent-run-policy'

export function canAutoActivatePlanMode(
  conversationId: string | undefined,
  skillId?: string | null,
): boolean {
  const id = conversationId?.trim()
  if (!id || !skillIsCodingAgent(skillId)) return false
  if (getCodingModeForConversation(id) !== 'normal') return false
  if (isPlanModeActive(id)) return false
  if (isPlanExecutionActive(id)) return false
  if (hasRecentPlanExecutionCompleted(id)) return false
  const storageOptions = planModeStorageOptionsFromEnv(id)
  if (hasPersistedPlanTodos(id, storageOptions)) return false
  return true
}

export function activatePlanModeForComplexTask(
  conversationId: string,
  titleHint?: string,
  trigger = 'auto:complex_task',
): void {
  const id = conversationId.trim()
  if (!id || isPlanModeActive(id)) return
  const storageOptions = planModeStorageOptionsFromEnv(id)
  planModeFor(id).activatePlanning({ trigger })
  clearExploreManifest(id, storageOptions)
  bootstrapPlanModeStorage(
    id,
    titleHint?.trim() || undefined,
    storageOptions,
  )
}

/** Fast heuristic before optional LLM routing. */
export function heuristicTaskLooksComplex(userMessage: string): boolean {
  const text = userMessage.trim()
  if (!text) return false
  if (text.length >= 320) return true
  if (text.split('\n').filter((line) => line.trim()).length >= 4) return true

  const complexPatterns = [
    /\b(refactor|restructure|redesign|migrate|migration|implement|architecture|multi[- ]step|multiple files|across the codebase|end[- ]to[- ]end)\b/i,
    /\b(plan|roadmap|break down|phased|phase \d|step \d)\b/i,
    /\b(and|then|also|after that)\b.*\b(and|then|also)\b/i,
  ]
  return complexPatterns.some((pattern) => pattern.test(text))
}

/**
 * In normal coding mode, auto-enter read-only explore mode when the task looks complex.
 * Runs silently (no Thinking pipeline step / bubble).
 */
export async function maybeAutoActivatePlanMode(
  ctx: AgentStepContext,
): Promise<boolean> {
  if (isSubAgentAgentRun(ctx)) return false

  const conversationId = ctx.opts.conversationId?.trim()
  if (!conversationId || !canAutoActivatePlanMode(conversationId, ctx.opts.skillId)) {
    return false
  }

  const userMessage = ctx.getLatestUserMessageContent().trim()
  if (!userMessage) return false

  if (heuristicTaskLooksComplex(userMessage)) {
    activatePlanModeForComplexTask(
      conversationId,
      userMessage.slice(0, 120),
      'auto:heuristic',
    )
    return true
  }

  const routing = await classifyTaskComplexity(ctx)
  if (routing?.execution_mode !== 'planning') return false

  activatePlanModeForComplexTask(
    conversationId,
    routing.task?.trim() || routing.goal?.trim() || userMessage.slice(0, 120),
    'auto:router',
  )
  return true
}
