import type { AgentPlanModeState } from './plan-mode'
import {
  DEFAULT_PLAN_MODE_VIEW,
  type PlanModeStatus,
  type PlanModeView,
} from './plan-mode-status'

export type {
  PlanModeDisplayStatus,
  PlanModeStatus,
  PlanModeView,
} from './plan-mode-status'

export {
  DEFAULT_PLAN_MODE_VIEW,
  isPlanModeStatus,
  normalizePlanModeStatus,
  planModeComposerHint,
  planModeStatusLabel,
  resolvePlanModeDisplayStatus,
} from './plan-mode-status'

/** Semantic transitions clients should use instead of patching raw fields. */
export type PlanModeTransition =
  | 'activatePlanning'
  | 'deactivatePlanning'
  | 'activateExecution'
  | 'deactivateExecution'
  | 'resetToIdle'

/** @deprecated Use {@link PlanModeStatus}. */
export type PlanningPhase = 'idle' | 'planning' | 'executing'

export function statusToLegacyPhase(status: PlanModeStatus): PlanningPhase {
  if (status === 'planning') return 'planning'
  if (status === 'plan_tool_execute') return 'executing'
  return 'idle'
}

/** @deprecated Use {@link AgentPlanModeState.status}. */
export function derivePlanningPhase(state: AgentPlanModeState): PlanningPhase {
  return statusToLegacyPhase(state.status)
}

export function toPlanModeView(state: AgentPlanModeState): PlanModeView {
  return {
    status: state.status,
    planSlug: state.planSlug,
  }
}

export function defaultPlanModeView(): PlanModeView {
  return { ...DEFAULT_PLAN_MODE_VIEW }
}
