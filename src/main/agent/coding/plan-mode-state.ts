import {
  DEFAULT_AGENT_PLAN_MODE_STATE,
  type AgentPlanModeState,
} from '@shared/agent/plan-mode'
import type { PlanModeView } from '@shared/agent/plan-mode-phase'
import { defaultPlanModeView } from '@shared/agent/plan-mode-phase'
import { planModeFor } from './plan-mode-state-machine'
import {
  clearPlanModeTodoArtifacts,
  planModeStorageOptionsFromEnv,
} from './plan-mode-storage-impl'

export {
  PlanModeStateMachine,
  planModeFor,
  transitionPlanMode,
} from './plan-mode-state-machine'

export type {
  PlanModeTransition,
  PlanModeView,
  PlanModeStatus,
  PlanModeDisplayStatus,
  PlanningPhase,
} from '@shared/agent/plan-mode-phase'

export type { PlanModeUpdateMeta } from './plan-mode-state-machine'

export {
  derivePlanningPhase,
  toPlanModeView,
  resolvePlanModeDisplayStatus,
  planModeStatusLabel,
} from '@shared/agent/plan-mode-phase'

/** @deprecated Prefer {@link planModeFor}(id).snapshot() or {@link planModeFor}(id).toView(). */
export function getPlanModeStateForConversation(
  conversationId: string | undefined,
): AgentPlanModeState {
  const id = conversationId?.trim()
  if (!id) return { ...DEFAULT_AGENT_PLAN_MODE_STATE }
  return planModeFor(id).snapshot()
}

export function getPlanModeView(conversationId: string | undefined): PlanModeView {
  const id = conversationId?.trim()
  if (!id) return defaultPlanModeView()
  return planModeFor(id).toView()
}

export function isPlanModeActive(conversationId: string | undefined): boolean {
  const id = conversationId?.trim()
  if (!id) return false
  return planModeFor(id).isPlanning()
}

export function isPlanExecutionActive(
  conversationId: string | undefined,
): boolean {
  const id = conversationId?.trim()
  if (!id) return false
  return planModeFor(id).isExecuting()
}

export function consumePendingPlanActivation(
  conversationId: string | undefined,
): boolean {
  const id = conversationId?.trim()
  if (!id) return false
  return planModeFor(id).consumeEnterReminder()
}

export function consumePendingPlanExecution(
  conversationId: string | undefined,
): boolean {
  const id = conversationId?.trim()
  if (!id) return false
  return planModeFor(id).consumeExecuteReminder()
}

export function hasPendingPlanActivation(
  conversationId: string | undefined,
): boolean {
  const id = conversationId?.trim()
  if (!id) return false
  return planModeFor(id).hasPendingEnterReminder()
}

export function hasPendingPlanExecution(
  conversationId: string | undefined,
): boolean {
  const id = conversationId?.trim()
  if (!id) return false
  return planModeFor(id).hasPendingExecuteReminder()
}

export function clearPlanMode(conversationId: string): PlanModeView {
  const view = planModeFor(conversationId).resetToIdle({
    trigger: 'api:clearPlanMode',
  })
  clearPlanModeTodoArtifacts(
    conversationId,
    planModeStorageOptionsFromEnv(conversationId),
  )
  return view
}

export { PLAN_MODE_TEMPLATE } from './plan-mode-template'

// Re-export unified sandbox plan storage (plan markdown + todos.json).
export {
  LEGACY_PLAN_MODE_PLANS_DIR,
  PLAN_MODE_PLANS_DIR,
  assignPlanSlug,
  isCanonicalPlanMarkdownPath,
  pruneStalePlanMarkdownFiles,
  bootstrapPlanModeStorage,
  bootstrapPlanFileForConversation,
  clearPlanModeTodoArtifacts,
  ensurePlanFileDirectory,
  isPathInPlanModePlansDir,
  isPlanFileWritten,
  normalizePlanModeRelativePath,
  parsePlanStepsFromMarkdown,
  planMarkdownHasActionableSteps,
  planModeStorageOptionsFromEnv,
  readPlanModeTodoList,
  resolvePlanFilePath,
  resolvePlanModeStorage,
  resolvePlanSandboxRoot,
  seedTodosFromPlanMarkdown,
  stableSandboxRootForConversation,
  writePlanModeTodoList,
  type PlanModeStorageOptions,
  type PlanModeStoragePaths,
  type ResolvedPlanFile,
} from './plan-mode-storage-impl'
