import { normalizePlanModeStatus, type PlanModeStatus } from './plan-mode-status'

/** Kimi-style agent explore mode state persisted per conversation. */
export type AgentPlanModeState = {
  /** Single lifecycle status — replaces legacy boolean flags. */
  status: PlanModeStatus
  /** Stable id for the plan file (e.g. `refactor-auth`). */
  planSlug: string | null
}

export const DEFAULT_AGENT_PLAN_MODE_STATE: AgentPlanModeState = {
  status: 'tool_execute',
  planSlug: null,
}

function parsePlanSlug(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function migrateLegacyStatus(raw: Record<string, unknown>): PlanModeStatus {
  if (isPlanModeStatus(raw.status)) return raw.status as PlanModeStatus

  const planMode = Boolean(raw.planMode ?? raw.active)
  const planExecutionActive = Boolean(raw.planExecutionActive)
  if (planMode) return 'planning'
  if (planExecutionActive) return 'plan_tool_execute'
  return 'tool_execute'
}

function isPlanModeStatus(value: unknown): value is PlanModeStatus {
  return (
    value === 'tool_execute' ||
    value === 'planning' ||
    value === 'plan_tool_execute'
  )
}

export function parseAgentPlanModeState(raw: unknown): AgentPlanModeState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AGENT_PLAN_MODE_STATE }
  const o = raw as Record<string, unknown>
  return {
    status: normalizePlanModeStatus(migrateLegacyStatus(o)),
    planSlug: parsePlanSlug(o.planSlug),
  }
}

export function serializeAgentPlanModeState(state: AgentPlanModeState): string {
  return JSON.stringify({
    status: state.status,
    planSlug: state.planSlug,
  })
}
