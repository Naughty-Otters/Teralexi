import type { ModelMessage, PrepareStepFunction } from 'ai'
import type { AgentStepContext } from '../context'
import {
  applyMidLoopBudget,
  getMidLoopBudgetState,
  rememberPrepareStepMessages,
} from '../expr/mid-loop-budget'
import { filterToolsByAvailableSet } from '../steps/step-helpers'
import { hasUnansweredToolCalls } from '../utils/message-sanitizer'
import { resolveLatestUserMessageIdentity } from './message-timestamp'
import {
  resolveInjectionProfile,
  selectInstructionInjectors,
  selectUserMessageInjectors,
} from './selector'
import type {
  InjectionProfile,
  InjectionRunContext,
  InjectionStage,
  PrepareStepSlice,
  TodoExecutionParams,
} from './types'
import { isInstructionInjector, isUserMessageInjector } from './types'
import {
  appendSuffixToTrailingUserMessage,
  USER_UPLOADS_INJECTOR_MARKER,
} from './injection-message-content'

function buildRunContext(
  ctx: AgentStepContext,
  profile: InjectionProfile,
  loopStep: number,
  messages: readonly ModelMessage[],
  todo?: TodoExecutionParams,
  allToolNames?: readonly string[],
): InjectionRunContext {
  const latestUser = resolveLatestUserMessageIdentity({
    clientUiMessages: ctx.opts.clientUiMessages,
    pendingUserMessage: ctx.opts.pendingUserMessage,
    modelMessages: messages,
  })

  return {
    profile,
    ctx,
    loopStep,
    messages,
    latestUserMessageId: latestUser?.id,
    latestUserMessageAt: latestUser?.createdAt,
    tools: filterToolsByAvailableSet(
      ctx.runtimeTools,
      ctx.opts.availableSet,
      ctx.opts.conversationId,
    ),
    todo,
    allToolNames,
  }
}

function instructionInjectors(profile: InjectionProfile) {
  return selectInstructionInjectors(profile)
    .filter(isInstructionInjector)
    .sort((a, b) => a.order - b.order)
}

function userMessageInjectors(profile: InjectionProfile) {
  return selectUserMessageInjectors(profile)
    .filter(isUserMessageInjector)
    .sort((a, b) => a.order - b.order)
}

function prepareStepInjectors(profile: InjectionProfile) {
  return selectInstructionInjectors(profile).filter(
    (injector) => typeof injector.onPrepareStep === 'function',
  )
}

export function assembleInstructions(
  ctx: AgentStepContext,
  stage: InjectionStage,
  options: { todo?: TodoExecutionParams } = {},
): string {
  const profile = resolveInjectionProfile(ctx, stage)
  const runCtx = buildRunContext(ctx, profile, 0, [], options.todo)
  const injectors = instructionInjectors(profile)

  const blocks: string[] = []
  const languageInjector = injectors.find((injector) => injector.id === 'language')

  for (const injector of injectors) {
    if (injector.id === 'language') continue
    if (!injector.applies(runCtx)) continue
    const block = injector.injectInstructions!(runCtx)
    if (block?.trim()) blocks.push(block.trim())
  }

  const assembled = blocks.join('\n\n')
  if (!languageInjector) return assembled

  const withLanguage = languageInjector.injectInstructions!({
    ...runCtx,
    assembledInstructions: assembled,
  })
  return withLanguage ?? assembled
}

export async function injectUserMessages(
  ctx: AgentStepContext,
  messages: ModelMessage[],
  loopStep: number,
): Promise<ModelMessage[]> {
  // Pending tool approvals / in-flight tool_calls must stay the trailing context so
  // the AI SDK can execute them. Appending plan-mode / follow-up user nudges here
  // puts `user` before tool-results and OpenAI rejects the next LLM call
  // (common with enter_plan_mode HITL + explore-mode injectors).
  if (hasUnansweredToolCalls(messages)) {
    return messages
  }

  const profile = resolveInjectionProfile(ctx, 'toolLoop')
  let nextMessages = messages

  for (const injector of userMessageInjectors(profile)) {
    const runCtx = buildRunContext(ctx, profile, loopStep, nextMessages)
    if (!injector.applies(runCtx)) continue

    if (typeof injector.augmentTrailingUserMessage === 'function') {
      const suffix = await injector.augmentTrailingUserMessage(runCtx)
      if (suffix?.trim()) {
        const augmented = appendSuffixToTrailingUserMessage(nextMessages, suffix, {
          dedupeMarker: USER_UPLOADS_INJECTOR_MARKER,
        })
        if (augmented !== nextMessages) {
          nextMessages = augmented
          continue
        }
        const fallback = await injector.injectUserMessage?.(runCtx)
        if (fallback) nextMessages = [...nextMessages, fallback]
      }
      continue
    }

    const msg = await injector.injectUserMessage!(runCtx)
    if (msg) nextMessages = [...nextMessages, msg]
  }

  return nextMessages
}

/** @deprecated Use {@link injectUserMessages}. */
export async function injectMessages(
  ctx: AgentStepContext,
  messages: ModelMessage[],
  loopStep: number,
): Promise<ModelMessage[]> {
  return injectUserMessages(ctx, messages, loopStep)
}

function mergePrepareStepSlices(
  slices: PrepareStepSlice[],
): PrepareStepSlice | undefined {
  let activeTools: string[] | undefined
  let mergedMessages: ModelMessage[] | undefined

  for (const slice of slices) {
    if (slice.activeTools && slice.activeTools.length > 0) {
      if (!activeTools) {
        activeTools = [...slice.activeTools]
      } else {
        const allow = new Set(slice.activeTools)
        activeTools = activeTools.filter((name) => allow.has(name))
      }
    }
    if (slice.messages) mergedMessages = slice.messages
  }

  if (!activeTools && !mergedMessages) return undefined
  return { activeTools, messages: mergedMessages }
}

/** @internal Exported for unit tests. */
export const mergePrepareStepSlicesForTests = mergePrepareStepSlices


export function createPrepareStepFromInjectors(
  ctx: AgentStepContext,
  allToolNames: readonly string[],
  stage: InjectionStage = 'toolLoop',
): PrepareStepFunction | undefined {
  const profile = resolveInjectionProfile(ctx, stage)
  const injectors = prepareStepInjectors(profile)

  return async ({ stepNumber, messages }) => {
    const blockUserInjection = hasUnansweredToolCalls(messages)
    let currentMessages = messages

    // Mid-loop char budget: prune (and optionally LLM-compact) before injectors.
    if (stepNumber > 0 && !blockUserInjection) {
      const budgeted = await applyMidLoopBudget(currentMessages, {
        stepNumber,
        ctx,
        state: getMidLoopBudgetState(ctx),
        allowLlmCompact: true,
      })
      if (budgeted.messages !== currentMessages) {
        currentMessages = budgeted.messages
      }
    }

    if (!blockUserInjection) {
      rememberPrepareStepMessages(ctx, currentMessages)
    }

    const runCtx = buildRunContext(
      ctx,
      profile,
      stepNumber,
      currentMessages,
      undefined,
      allToolNames,
    )
    const slices: PrepareStepSlice[] = []
    if (currentMessages !== messages) {
      slices.push({ messages: currentMessages })
    }

    for (const injector of injectors) {
      if (!injector.applies(runCtx)) continue
      const slice = await injector.onPrepareStep!(
        { ...runCtx, loopStep: stepNumber, messages: currentMessages },
        { stepNumber, messages: currentMessages, allToolNames },
      )
      if (!slice) continue
      // Keep activeTools / other prepareStep settings, but never append user
      // nudges (plan-mode "continue explore mode") onto incomplete tool rounds.
      if (blockUserInjection && slice.messages) {
        slices.push({ activeTools: slice.activeTools })
        continue
      }
      slices.push(slice)
      if (slice.messages) currentMessages = slice.messages
    }

    return mergePrepareStepSlices(slices)
  }
}
