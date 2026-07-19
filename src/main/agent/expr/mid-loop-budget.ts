/**
 * Mid-loop context budgeting: prune (cheap) then optionally LLM-compact when
 * the rolling tool-loop transcript exceeds the char budget.
 *
 * Shared by prepareStep (every LLM step) and overflow recovery.
 */
import type { ModelMessage } from '@teralexi-ai'
import { createLogger } from '@main/logger'
import { MID_LOOP_BUDGET_BUNDLE_MARKER } from '@main/agent/harness-bundle-markers'
import type { AgentStepContext } from '../context'
import {
  compactConversationIfNeeded,
  estimateMessageChars,
} from '../compaction'
import {
  DEFAULT_MESSAGE_CHAR_BUDGET,
  DEFAULT_PRESERVE_RECENT_ROUNDS,
  pruneOldToolResultsFromMessages,
} from './context-overflow-guard'
import { hasUnansweredToolCalls } from '../utils/message-sanitizer'

const log = createLogger('agent.expr.mid-loop-budget')

/** Soft floor after prune: stay under this fraction before allowing another LLM compact. */
export const MID_LOOP_COMPACT_RECOVERY_RATIO = 0.85

/** Minimum steps between LLM mid-loop compacts. */
export const MID_LOOP_COMPACT_COOLDOWN_STEPS = 3

/** Rough chars-per-token when converting usage.inputTokens → char estimate. */
const CHARS_PER_TOKEN_ESTIMATE = 4

export type MidLoopBudgetState = {
  lastCompactStep: number | null
  overflowRecoveryUsed: boolean
  /**
   * Latest complete-round messages seen in prepareStep (growing mid-loop
   * transcript). Used when CONTEXT_OVERFLOW recovery only has the initial
   * stream messages.
   */
  lastPrepareStepMessages: ModelMessage[] | null
}

const stateByFlow = new WeakMap<object, MidLoopBudgetState>()
/** Fallback when prepareStep runs without a real AgentFlowContext (unit tests). */
let orphanState: MidLoopBudgetState | null = null

function emptyState(): MidLoopBudgetState {
  return {
    lastCompactStep: null,
    overflowRecoveryUsed: false,
    lastPrepareStepMessages: null,
  }
}

export function getMidLoopBudgetState(ctx: AgentStepContext): MidLoopBudgetState {
  const key = ctx.agentFlow as object | undefined
  if (!key || (typeof key !== 'object' && typeof key !== 'function')) {
    if (!orphanState) orphanState = emptyState()
    return orphanState
  }
  let state = stateByFlow.get(key)
  if (!state) {
    state = emptyState()
    stateByFlow.set(key, state)
  }
  return state
}

/** Allow a fresh overflow recovery for a new standalone/todo stream. */
export function resetOverflowRecoveryForStream(ctx: AgentStepContext): void {
  getMidLoopBudgetState(ctx).overflowRecoveryUsed = false
}

/** Remember the latest complete-round prepareStep messages for overflow recovery. */
export function rememberPrepareStepMessages(
  ctx: AgentStepContext,
  messages: ModelMessage[],
): void {
  if (hasUnansweredToolCalls(messages)) return
  getMidLoopBudgetState(ctx).lastPrepareStepMessages = messages
}

/** @internal Test helper. */
export function resetMidLoopBudgetStateForTests(ctx?: AgentStepContext): void {
  orphanState = null
  if (ctx?.agentFlow && typeof ctx.agentFlow === 'object') {
    stateByFlow.delete(ctx.agentFlow as object)
  }
}

export type ApplyMidLoopBudgetOpts = {
  stepNumber: number
  charBudget?: number
  preserveRecentRounds?: number
  currentThreadTag?: string
  /** Soft signal from last LLM step (provider usage). */
  lastInputTokens?: number
  /**
   * When true (default), escalate to LLM compact if prune is not enough.
   * P2a call sites may pass false to prune-only.
   */
  allowLlmCompact?: boolean
  compactCooldownSteps?: number
  /** Required when allowLlmCompact is true. */
  ctx?: AgentStepContext
  state?: MidLoopBudgetState
}

export type ApplyMidLoopBudgetResult = {
  messages: ModelMessage[]
  pruned: number
  compacted: boolean
  charsBefore: number
  charsAfter: number
  skippedIncompleteRound: boolean
}

function isOverBudget(
  messages: ModelMessage[],
  charBudget: number,
  lastInputTokens?: number,
): boolean {
  const chars = estimateMessageChars(messages)
  if (chars > charBudget) return true
  if (
    typeof lastInputTokens === 'number' &&
    lastInputTokens > 0 &&
    lastInputTokens * CHARS_PER_TOKEN_ESTIMATE > charBudget
  ) {
    return true
  }
  return false
}

function canLlmCompact(
  state: MidLoopBudgetState,
  stepNumber: number,
  cooldown: number,
  charsAfterPrune: number,
  charBudget: number,
): boolean {
  if (charsAfterPrune <= charBudget * MID_LOOP_COMPACT_RECOVERY_RATIO) {
    return false
  }
  if (state.lastCompactStep == null) return true
  return stepNumber - state.lastCompactStep >= cooldown
}

function pickRicherMessages(
  primary: ModelMessage[],
  remembered: ModelMessage[] | null,
): ModelMessage[] {
  if (!remembered?.length) return primary
  const primaryChars = estimateMessageChars(primary)
  const rememberedChars = estimateMessageChars(remembered)
  // Prefer the longer transcript (usually mid-loop growth that overflowed).
  if (rememberedChars > primaryChars) return remembered
  if (remembered.length > primary.length) return remembered
  return primary
}

/**
 * Apply mid-loop budget policy to messages.
 * No-ops on incomplete tool rounds (unanswered tool-calls) to avoid orphaning pairs.
 */
export async function applyMidLoopBudget(
  messages: ModelMessage[],
  opts: ApplyMidLoopBudgetOpts,
): Promise<ApplyMidLoopBudgetResult> {
  const charBudget = opts.charBudget ?? DEFAULT_MESSAGE_CHAR_BUDGET
  const preserveRecentRounds =
    opts.preserveRecentRounds ?? DEFAULT_PRESERVE_RECENT_ROUNDS
  const allowLlmCompact = opts.allowLlmCompact !== false
  const cooldown = opts.compactCooldownSteps ?? MID_LOOP_COMPACT_COOLDOWN_STEPS
  const charsBefore = estimateMessageChars(messages)
  const state = opts.state ?? (opts.ctx ? getMidLoopBudgetState(opts.ctx) : null)

  if (opts.stepNumber <= 0) {
    return {
      messages,
      pruned: 0,
      compacted: false,
      charsBefore,
      charsAfter: charsBefore,
      skippedIncompleteRound: false,
    }
  }

  if (hasUnansweredToolCalls(messages)) {
    return {
      messages,
      pruned: 0,
      compacted: false,
      charsBefore,
      charsAfter: charsBefore,
      skippedIncompleteRound: true,
    }
  }

  if (!isOverBudget(messages, charBudget, opts.lastInputTokens)) {
    return {
      messages,
      pruned: 0,
      compacted: false,
      charsBefore,
      charsAfter: charsBefore,
      skippedIncompleteRound: false,
    }
  }

  const pruned = pruneOldToolResultsFromMessages(messages, {
    charBudget,
    preserveRecentRounds,
    currentThreadTag: opts.currentThreadTag,
  })

  let next = pruned.messages
  let compacted = false

  const stillOver = isOverBudget(next, charBudget)
  if (
    stillOver &&
    allowLlmCompact &&
    opts.ctx &&
    state &&
    canLlmCompact(state, opts.stepNumber, cooldown, pruned.charsAfter, charBudget)
  ) {
    // Advance cooldown even if compact fails so we do not hammer the summarizer.
    state.lastCompactStep = opts.stepNumber
    const compactResult = await compactConversationIfNeeded(opts.ctx, next, {
      charBudget,
      preserveRecentRounds,
      forceCompact: true,
      threadTag: opts.currentThreadTag,
    })
    if (compactResult.compacted) {
      next = compactResult.messages
      compacted = true
      log.info('Mid-loop LLM compact applied', {
        stepNumber: opts.stepNumber,
        charsBefore: pruned.charsAfter,
        charsAfter: estimateMessageChars(next),
      })
    }
  }

  const charsAfter = estimateMessageChars(next)
  if (pruned.pruned > 0 || compacted) {
    log.debug('Mid-loop budget applied', {
      stepNumber: opts.stepNumber,
      pruned: pruned.pruned,
      compacted,
      charsBefore,
      charsAfter,
    })
  }

  return {
    messages: next,
    pruned: pruned.pruned,
    compacted,
    charsBefore,
    charsAfter,
    skippedIncompleteRound: false,
  }
}

/**
 * One-shot overflow recovery: force compact + prune for a retry after
 * CONTEXT_OVERFLOW. Prefers mid-loop prepareStep messages when richer than
 * the initial stream payload. Returns null if recovery was already used.
 */
export async function recoverFromContextOverflow(
  ctx: AgentStepContext,
  messages: ModelMessage[],
  opts: {
    currentThreadTag?: string
    charBudget?: number
  } = {},
): Promise<ModelMessage[] | null> {
  const state = getMidLoopBudgetState(ctx)
  if (state.overflowRecoveryUsed) return null
  state.overflowRecoveryUsed = true

  const charBudget = opts.charBudget ?? DEFAULT_MESSAGE_CHAR_BUDGET
  let next = pickRicherMessages(messages, state.lastPrepareStepMessages)

  const compactResult = await compactConversationIfNeeded(ctx, next, {
    charBudget,
    forceCompact: true,
    threadTag: opts.currentThreadTag,
  })
  if (compactResult.compacted) {
    next = compactResult.messages
  }
  // Start cooldown so the next prepareStep does not immediately re-compact.
  state.lastCompactStep = state.lastCompactStep ?? 0

  const pruned = pruneOldToolResultsFromMessages(next, {
    charBudget,
    currentThreadTag: opts.currentThreadTag,
  })
  next = pruned.messages
  state.lastPrepareStepMessages = next

  log.info('Context overflow recovery applied', {
    charsAfter: estimateMessageChars(next),
    pruned: pruned.pruned,
    compacted: compactResult.compacted,
  })
  return next
}

/** Packaging marker — must remain reachable in main-app.js. */
;(recoverFromContextOverflow as { bundleMarker?: string }).bundleMarker =
  MID_LOOP_BUDGET_BUNDLE_MARKER
