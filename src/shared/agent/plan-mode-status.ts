/** Persisted plan lifecycle status (single source of truth). */
export type PlanModeStatus =
  | 'tool_execute'
  | 'planning'
  | 'plan_tool_execute'

/**
 * UI-facing status — adds ephemeral HITL wait overlay on top of persisted status.
 * `wait_for_approval` is derived client-side when tool approval is pending.
 */
export type PlanModeDisplayStatus = PlanModeStatus | 'wait_for_approval'

export type PlanModeView = {
  status: PlanModeStatus
  planSlug: string | null
}

export const DEFAULT_PLAN_MODE_VIEW: PlanModeView = {
  status: 'tool_execute',
  planSlug: null,
}

const PLAN_MODE_STATUSES = new Set<PlanModeStatus>([
  'tool_execute',
  'planning',
  'plan_tool_execute',
])

export function isPlanModeStatus(value: unknown): value is PlanModeStatus {
  return typeof value === 'string' && PLAN_MODE_STATUSES.has(value as PlanModeStatus)
}

export function normalizePlanModeStatus(value: unknown): PlanModeStatus {
  if (isPlanModeStatus(value)) return value
  return 'tool_execute'
}

export function resolvePlanModeDisplayStatus(
  view: PlanModeView,
  pendingApproval: boolean,
): PlanModeDisplayStatus {
  if (pendingApproval && view.status !== 'tool_execute') {
    return 'wait_for_approval'
  }
  return view.status
}

export function planModeStatusLabel(status: PlanModeDisplayStatus): string {
  switch (status) {
    case 'planning':
      return 'Exploring'
    case 'plan_tool_execute':
      return 'Executing'
    case 'wait_for_approval':
      return 'Awaiting approval'
    default:
      return 'Normal'
  }
}

/** Composer banner copy for the active plan lifecycle phase. */
export function planModeComposerHint(
  status: PlanModeDisplayStatus,
): string | null {
  switch (status) {
    case 'planning':
      return 'Exploring — agent is read-only until the plan is approved.'
    case 'plan_tool_execute':
      return 'Executing approved tasks — work runs from plans/todos.json.'
    case 'wait_for_approval':
      return 'Waiting for your approval before the agent can continue.'
    default:
      return null
  }
}
