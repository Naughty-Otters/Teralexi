import {
  DEFAULT_AGENT_PLAN_MODE_STATE,
  type AgentPlanModeState,
} from '@shared/agent/plan-mode'
import {
  DEFAULT_PLAN_MODE_VIEW,
  type PlanModeStatus,
  type PlanModeTransition,
  type PlanModeView,
  toPlanModeView,
} from '@shared/agent/plan-mode-phase'
import { createLogger } from '@main/logger'
import { getConversationStore } from '@main/services/conversation-store'
import { notifyPlanModeStateChanged } from '@main/services/plan-mode-state-notify'
import {
  clearPlanExecutionCompleted,
  clearPlanReminders,
  consumeEnterPlanReminder,
  consumeExecutePlanReminder,
  hasEnterPlanReminder,
  hasExecutePlanReminder,
  markEnterPlanReminder,
  markExecutePlanReminder,
} from './plan-mode-session-reminders'

const log = createLogger('agent.plan-mode.state')

/** Why a persisted plan-mode update happened (for logs and debugging). */
export type PlanModeUpdateMeta = {
  /** Source of the update, e.g. `tool:enter_plan_mode`, `ipc:TransitionPlanMode`. */
  trigger: string
  /** Optional human-readable detail (action name, slug, etc.). */
  reason?: string
}

function defaultMeta(trigger: string): PlanModeUpdateMeta {
  return { trigger }
}

/**
 * Isolated planning lifecycle state machine.
 *
 * Clients call semantic transitions (`activatePlanning`, `activateExecution`, …)
 * instead of patching individual persisted flags.
 */
export class PlanModeStateMachine {
  private state: AgentPlanModeState

  private constructor(
    private readonly conversationId: string,
    initial: AgentPlanModeState,
  ) {
    this.state = { ...initial }
  }

  static forConversation(conversationId: string): PlanModeStateMachine {
    const id = conversationId.trim()
    if (!id) {
      return new PlanModeStateMachine('', { ...DEFAULT_AGENT_PLAN_MODE_STATE })
    }
    try {
      const stored = getConversationStore().getConversationPlanModeState(id)
      return new PlanModeStateMachine(id, stored)
    } catch {
      return new PlanModeStateMachine(id, { ...DEFAULT_AGENT_PLAN_MODE_STATE })
    }
  }

  get status(): PlanModeStatus {
    return this.state.status
  }

  get planSlug(): string | null {
    return this.state.planSlug
  }

  isIdle(): boolean {
    return this.state.status === 'tool_execute'
  }

  isPlanning(): boolean {
    return this.state.status === 'planning'
  }

  isExecuting(): boolean {
    return this.state.status === 'plan_tool_execute'
  }

  /** @deprecated Use {@link status}. */
  get phase(): PlanModeStatus {
    return this.state.status
  }

  /** Read-only copy of persisted storage. */
  snapshot(): AgentPlanModeState {
    return { ...this.state }
  }

  toView(): PlanModeView {
    return toPlanModeView(this.state)
  }

  /** Enter read-only explore mode (`/explore`, `enter_plan_mode`). */
  activatePlanning(meta: PlanModeUpdateMeta = defaultMeta('activatePlanning')): PlanModeView {
    clearPlanExecutionCompleted(this.conversationId)
    markEnterPlanReminder(this.conversationId)
    return this.commit(
      {
        ...this.state,
        status: 'planning',
      },
      meta,
    )
  }

  /** Leave planning without starting execution (abandon / cancel planning). */
  deactivatePlanning(
    meta: PlanModeUpdateMeta = defaultMeta('deactivatePlanning'),
  ): PlanModeView {
    clearPlanReminders(this.conversationId)
    return this.commit(
      {
        ...this.state,
        status: 'tool_execute',
      },
      meta,
    )
  }

  /** Start executing an approved plan (`exit_plan_mode` after approval). */
  activateExecution(
    meta: PlanModeUpdateMeta = defaultMeta('activateExecution'),
  ): PlanModeView {
    clearPlanReminders(this.conversationId)
    markExecutePlanReminder(this.conversationId)
    return this.commit(
      {
        ...this.state,
        status: 'plan_tool_execute',
      },
      meta,
    )
  }

  /** Finish approved-plan execution (all todos done). */
  deactivateExecution(
    meta: PlanModeUpdateMeta = defaultMeta('deactivateExecution'),
  ): PlanModeView {
    clearPlanReminders(this.conversationId)
    return this.commit(
      {
        ...this.state,
        status: 'tool_execute',
      },
      meta,
    )
  }

  /** Full reset to idle (`/explore clear` or legacy `/plan clear`). */
  resetToIdle(meta: PlanModeUpdateMeta = defaultMeta('resetToIdle')): PlanModeView {
    clearPlanReminders(this.conversationId)
    clearPlanExecutionCompleted(this.conversationId)
    return this.commit(
      { ...DEFAULT_AGENT_PLAN_MODE_STATE },
      meta,
    )
  }

  applyTransition(
    action: PlanModeTransition,
    meta?: PlanModeUpdateMeta,
  ): PlanModeView {
    const resolved: PlanModeUpdateMeta = meta ?? {
      trigger: `transition:${action}`,
      reason: action,
    }
    switch (action) {
      case 'activatePlanning':
        return this.activatePlanning(resolved)
      case 'deactivatePlanning':
        return this.deactivatePlanning(resolved)
      case 'activateExecution':
        return this.activateExecution(resolved)
      case 'deactivateExecution':
        return this.deactivateExecution(resolved)
      case 'resetToIdle':
        return this.resetToIdle(resolved)
      default: {
        const _exhaustive: never = action
        return _exhaustive
      }
    }
  }

  assignPlanSlug(slug: string, meta?: PlanModeUpdateMeta): PlanModeView {
    const trimmed = slug.trim()
    if (!trimmed) return this.toView()
    return this.commit(
      { ...this.state, planSlug: trimmed },
      meta ?? { trigger: 'storage:assignPlanSlug', reason: trimmed },
    )
  }

  /** One-shot enter/reenter reminder for the next tool-loop step. */
  consumeEnterReminder(
    meta: PlanModeUpdateMeta = defaultMeta('injection:consumeEnterReminder'),
  ): boolean {
    const consumed = consumeEnterPlanReminder(this.conversationId)
    if (consumed) {
      log.debug('Consumed enter plan reminder', {
        conversationId: this.conversationId,
        trigger: meta.trigger,
      })
    }
    return consumed
  }

  /** One-shot post-approval execute reminder for the next tool-loop step. */
  consumeExecuteReminder(
    meta: PlanModeUpdateMeta = defaultMeta('injection:consumeExecuteReminder'),
  ): boolean {
    const consumed = consumeExecutePlanReminder(this.conversationId)
    if (consumed) {
      log.debug('Consumed execute plan reminder', {
        conversationId: this.conversationId,
        trigger: meta.trigger,
      })
    }
    return consumed
  }

  hasPendingEnterReminder(): boolean {
    return hasEnterPlanReminder(this.conversationId)
  }

  hasPendingExecuteReminder(): boolean {
    return hasExecutePlanReminder(this.conversationId)
  }

  private commit(next: AgentPlanModeState, meta: PlanModeUpdateMeta): PlanModeView {
    const fromStatus = this.state.status
    const from = { ...this.state }
    this.state = { ...next }
    const view = this.persist()
    this.logUpdate(from, fromStatus, view.status, meta)
    if (this.conversationId && fromStatus !== view.status) {
      notifyPlanModeStateChanged(this.conversationId, view)
    }
    return view
  }

  private persist(): PlanModeView {
    if (!this.conversationId) return { ...DEFAULT_PLAN_MODE_VIEW }
    getConversationStore().setConversationPlanModeState(
      this.conversationId,
      this.state,
    )
    return this.toView()
  }

  private logUpdate(
    from: AgentPlanModeState,
    fromStatus: PlanModeStatus,
    toStatus: PlanModeStatus,
    meta: PlanModeUpdateMeta,
  ): void {
    if (!this.conversationId) return

    const statusChanged = fromStatus !== toStatus
    const payload = {
      conversationId: this.conversationId,
      trigger: meta.trigger,
      reason: meta.reason,
      fromStatus,
      toStatus,
      from: {
        status: from.status,
        planSlug: from.planSlug,
      },
      to: {
        status: this.state.status,
        planSlug: this.state.planSlug,
      },
    }

    if (statusChanged) {
      log.info('Explore mode status transition', payload)
    } else {
      log.info('Explore mode state updated', payload)
    }
  }
}

export function planModeFor(conversationId: string): PlanModeStateMachine {
  return PlanModeStateMachine.forConversation(conversationId)
}

export function transitionPlanMode(
  conversationId: string,
  action: PlanModeTransition,
  meta?: PlanModeUpdateMeta,
): PlanModeView {
  return planModeFor(conversationId).applyTransition(action, meta)
}
