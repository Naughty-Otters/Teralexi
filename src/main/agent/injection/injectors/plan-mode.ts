import { resolvePlanModeActiveToolNames } from '../../coding/plan-mode-active-tools'
import {
  resolvePlanModeInstructionBlock,
  resolvePlanModeInjectionMessage,
} from '../../coding/plan-mode-injection-content'
import {
  bootstrapPlanFileForConversation,
  isPlanModeActive,
} from '../../coding/plan-mode-state'
import { attachInjectorMessageMeta } from '../injection-message-meta'
import type { AgentInjector, InjectionRunContext } from '../types'
import { INJECTOR_ORDER } from './orders'

function isRootRun(ctx: InjectionRunContext['ctx']): boolean {
  const depth = ctx.agentRun?.meta?.depth
  return depth === undefined || depth === 0
}

function sandboxRootFromCtx(ctx: InjectionRunContext['ctx']): string | undefined {
  return ctx.sandbox?.getRoot?.()?.trim() || undefined
}

function ensurePlanFileReady(
  conversationId: string | undefined,
  sandboxRoot?: string,
): void {
  const id = conversationId?.trim()
  if (!id || !isPlanModeActive(id)) return
  bootstrapPlanFileForConversation(id, undefined, { sandboxRoot })
}

function withPlanModeInjectorMeta(
  message: NonNullable<ReturnType<typeof resolvePlanModeInjectionMessage>>,
): ReturnType<typeof resolvePlanModeInjectionMessage> {
  return attachInjectorMessageMeta(message, {
    injectorId: 'plan-mode',
    injectedAt: new Date().toISOString(),
  })
}

export const planModeInjector: AgentInjector = {
  id: 'plan-mode',
  order: INJECTOR_ORDER.LANGUAGE + 1,
  applies({ profile }) {
    return profile.stage === 'toolLoop' && profile.runDepth === 0
  },
  injectInstructions({ ctx }) {
    if (!isRootRun(ctx)) return null
    ensurePlanFileReady(ctx.opts.conversationId, sandboxRootFromCtx(ctx))
    return resolvePlanModeInstructionBlock(
      ctx.opts.conversationId,
      0,
      sandboxRootFromCtx(ctx),
    )
  },
  injectUserMessage({ profile, ctx, loopStep }) {
    if (profile.planModeUsesPrepareStep) return null
    if (!isRootRun(ctx)) return null
    ensurePlanFileReady(ctx.opts.conversationId, sandboxRootFromCtx(ctx))
    const message = resolvePlanModeInjectionMessage(
      ctx.opts.conversationId,
      loopStep,
      sandboxRootFromCtx(ctx),
    )
    return message ? withPlanModeInjectorMeta(message) : null
  },
  onPrepareStep({ profile, ctx, loopStep }, step) {
    if (!profile.planModeUsesPrepareStep) return undefined
    if (!isRootRun(ctx)) return undefined

    ensurePlanFileReady(ctx.opts.conversationId, sandboxRootFromCtx(ctx))

    const injection = resolvePlanModeInjectionMessage(
      ctx.opts.conversationId,
      loopStep,
      sandboxRootFromCtx(ctx),
    )
    const planActive = isPlanModeActive(ctx.opts.conversationId)

    if (!injection && !planActive) return undefined

    const result: {
      activeTools?: string[]
      messages?: typeof step.messages
    } = {}

    if (planActive) {
      result.activeTools = resolvePlanModeActiveToolNames(
        step.allToolNames,
        true,
        ctx.opts.conversationId,
      )
    }

    if (injection) {
      result.messages = [
        ...step.messages,
        withPlanModeInjectorMeta(injection),
      ]
    }

    return Object.keys(result).length > 0 ? result : undefined
  },
}
