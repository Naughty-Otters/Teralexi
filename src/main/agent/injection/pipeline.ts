import type { ModelMessage, PrepareStepFunction } from 'ai'
import type { AgentStepContext } from '../context'
import { filterToolsByAvailableSet } from '../steps/step-helpers'
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
  const profile = resolveInjectionProfile(ctx, 'toolLoop')
  let nextMessages = messages

  for (const injector of userMessageInjectors(profile)) {
    const runCtx = buildRunContext(ctx, profile, loopStep, nextMessages)
    if (!injector.applies(runCtx)) continue
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
    if (slice.activeTools) activeTools = slice.activeTools
    if (slice.messages) mergedMessages = slice.messages
  }

  if (!activeTools && !mergedMessages) return undefined
  return { activeTools, messages: mergedMessages }
}

export function createPrepareStepFromInjectors(
  ctx: AgentStepContext,
  allToolNames: readonly string[],
): PrepareStepFunction | undefined {
  const profile = resolveInjectionProfile(ctx, 'toolLoop')
  const injectors = prepareStepInjectors(profile)
  if (injectors.length === 0) return undefined

  return async ({ stepNumber, messages }) => {
    const runCtx = buildRunContext(
      ctx,
      profile,
      stepNumber,
      messages,
      undefined,
      allToolNames,
    )
    const slices: PrepareStepSlice[] = []
    let currentMessages = messages

    for (const injector of injectors) {
      if (!injector.applies(runCtx)) continue
      const slice = await injector.onPrepareStep!(
        { ...runCtx, loopStep: stepNumber, messages: currentMessages },
        { stepNumber, messages: currentMessages, allToolNames },
      )
      if (!slice) continue
      slices.push(slice)
      if (slice.messages) currentMessages = slice.messages
    }

    return mergePrepareStepSlices(slices)
  }
}
