import {
  parsePlanStepsFromMarkdown,
  planMarkdownHasActionableSteps,
  planModeStorageOptionsFromEnv,
  seedTodosFromPlanMarkdown,
} from '@main/agent/coding/plan-mode-storage-impl'
import { getConversationIdFromEnv } from '../sandbox-paths'

export { parsePlanStepsFromMarkdown, planMarkdownHasActionableSteps }

/** @deprecated Use {@link seedTodosFromPlanMarkdown}. */
export function seedTodosFromPlan(planPath: string): { seeded: number } {
  const conversationId = getConversationIdFromEnv()
  if (!conversationId) return { seeded: 0 }
  return seedTodosFromPlanMarkdown(
    conversationId,
    planPath,
    planModeStorageOptionsFromEnv(conversationId),
  )
}
