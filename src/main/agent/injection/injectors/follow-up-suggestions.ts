import type { ModelMessage } from '@teralexi-ai'
import { lastAssistantDraftIsTextOnly } from '../deep-thinking-blocks'
import { findLastInjectorMessageMeta } from '../injection-message-meta'
import { buildInjectorUserMessage } from '../injector'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export const FOLLOW_UP_SUGGESTIONS_INJECTOR_ID = 'follow-up-suggestions'
/** Separate id so the standing user reminder does not block the after-answer nudge. */
export const FOLLOW_UP_SUGGESTIONS_NUDGE_ID = 'follow-up-suggestions-nudge'

export const FOLLOW_UP_SUGGESTIONS_STANDING_USER_TEXT = [
  'Follow-up suggestions: only after this turn fully finishes with a final user-facing answer',
  '(no pending tool calls, and not while waiting for user approval or form input),',
  'if useful next-step options exist, call `generate_follow_up` with 1–N items',
  '(each with `label` + `action`: `user_input` or `tool_call`).',
  'Do not call `generate_follow_up` mid-turn or when the run will pause for human-in-the-loop.',
  'If there are no good options, skip `generate_follow_up` entirely.',
].join(' ')

export const FOLLOW_UP_SUGGESTIONS_NUDGE_TEXT = [
  'Your draft final answer is ready.',
  'Call `generate_follow_up` only if this turn is complete now (no further tools, and no user approval/form pause).',
  'If useful recommended next steps exist for the user (based on their request and your answer), call `generate_follow_up` now with 1–N items.',
  'Each item needs: `label` (short explanation of the next step) and `action` — either `{ type: "user_input", message }` or `{ type: "tool_call", tool, args? }`.',
  'If you still need tools or human approval, or there are no good follow-up options, do not call `generate_follow_up`.',
].join(' ')

function isRootRun(ctx: { agentRun?: { meta?: { depth?: number } } }): boolean {
  const depth = ctx.agentRun?.meta?.depth
  return depth === undefined || depth === 0
}

export function shouldInjectFollowUpSuggestionsNudge(
  messages: readonly ModelMessage[],
): boolean {
  if (findLastInjectorMessageMeta(messages, FOLLOW_UP_SUGGESTIONS_NUDGE_ID)) {
    return false
  }
  return lastAssistantDraftIsTextOnly(messages) != null
}

/**
 * Always injected on root tool-loop turns as user messages:
 * 1) standing reminder at turn start
 * 2) prepareStep nudge after a text-only final draft
 *
 * Not injected into system instructions.
 */
export const followUpSuggestionsInjector: AgentInjector = {
  id: FOLLOW_UP_SUGGESTIONS_INJECTOR_ID,
  kind: 'user-message',
  order: INJECTOR_ORDER.FOLLOW_UP_SUGGESTIONS,
  applies({ profile, ctx }) {
    return profile.stage === 'toolLoop' && isRootRun(ctx)
  },
  injectUserMessage({ messages }) {
    // Once per conversation turn; later tool-loop steps reuse the standing reminder.
    if (
      messages &&
      findLastInjectorMessageMeta(messages, FOLLOW_UP_SUGGESTIONS_INJECTOR_ID)
    ) {
      return null
    }
    return buildInjectorUserMessage(
      FOLLOW_UP_SUGGESTIONS_INJECTOR_ID,
      FOLLOW_UP_SUGGESTIONS_STANDING_USER_TEXT,
    )
  },
  onPrepareStep({ profile, ctx, messages }, step) {
    if (profile.stage !== 'toolLoop' || !isRootRun(ctx)) return undefined
    if (step.stepNumber < 1) return undefined
    if (!shouldInjectFollowUpSuggestionsNudge(messages)) return undefined

    return {
      messages: [
        ...messages,
        buildInjectorUserMessage(
          FOLLOW_UP_SUGGESTIONS_NUDGE_ID,
          FOLLOW_UP_SUGGESTIONS_NUDGE_TEXT,
        ),
      ],
    }
  },
}
