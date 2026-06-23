import type { ModelMessage } from '@openfde-ai'
import type { AgentStepContext } from '../context'
import type { RuntimeToolMeta } from '../types'

export type InjectionStage = 'toolLoop' | 'todoExecution'

export type InjectionProfileKey =
  | 'toolLoop.default'
  | 'toolLoop.coding.root'
  | 'toolLoop.coding.child'
  | 'todoExecution'

export type InjectionProfile = {
  key: InjectionProfileKey
  stage: InjectionStage
  skillId?: string
  runDepth: number
  isCodingAgent: boolean
  /** Root coding tool-loop uses prepareStep for plan mode (not message injection). */
  planModeUsesPrepareStep: boolean
}

export type TodoExecutionParams = {
  stepGoal: string
  attempt: number
  maxAttempts: number
  lastRetryContext: string
  previousStepBlock: string
}

export type InjectionRunContext = {
  profile: InjectionProfile
  ctx: AgentStepContext
  loopStep: number
  tools: RuntimeToolMeta[]
  /** Conversation messages about to be sent to the model. */
  messages: readonly ModelMessage[]
  /** Latest user turn id from client UI (preferred) or model fallback. */
  latestUserMessageId?: string
  /** Latest user turn timestamp from client UI when available. */
  latestUserMessageAt?: string
  todo?: TodoExecutionParams
  /** Full instructions assembled so far; set by pipeline for wrapper injectors. */
  assembledInstructions?: string
  allToolNames?: readonly string[]
}

export type PrepareStepContext = {
  stepNumber: number
  messages: ModelMessage[]
  allToolNames: readonly string[]
}

export type PrepareStepSlice = {
  activeTools?: string[]
  messages?: ModelMessage[]
}

export interface AgentInjector {
  readonly id: string
  readonly order: number
  /** `instruction` blocks go to system prompt; `user-message` blocks append user rows. */
  readonly kind?: 'instruction' | 'user-message'
  /** Return true to inject for this run; false to skip. */
  applies(context: InjectionRunContext): boolean
  injectInstructions?(
    context: InjectionRunContext,
  ): string | null | Promise<string | null>
  injectUserMessage?(
    context: InjectionRunContext,
  ): ModelMessage | null | Promise<ModelMessage | null>
  onPrepareStep?(
    context: InjectionRunContext,
    step: PrepareStepContext,
  ): PrepareStepSlice | undefined | Promise<PrepareStepSlice | undefined>
}

/** System-prompt injector with a required {@link AgentInjector.injectInstructions}. */
export type InstructionInjector = AgentInjector & {
  kind: 'instruction'
  injectInstructions(
    context: InjectionRunContext,
  ): string | null | Promise<string | null>
}

/** Conversation injector with a required {@link AgentInjector.injectUserMessage}. */
export type UserMessageInjector = AgentInjector & {
  kind: 'user-message'
  injectUserMessage(
    context: InjectionRunContext,
  ): ModelMessage | null | Promise<ModelMessage | null>
}

export function isInstructionInjector(
  injector: AgentInjector,
): injector is InstructionInjector {
  return (
    injector.kind === 'instruction' ||
    typeof injector.injectInstructions === 'function'
  )
}

export function isUserMessageInjector(
  injector: AgentInjector,
): injector is UserMessageInjector {
  return (
    injector.kind === 'user-message' ||
    typeof injector.injectUserMessage === 'function'
  )
}

/** @deprecated Use AgentInjector — kept for migration references. */
export type InjectionContext = {
  ctx: AgentStepContext
  loopStep: number
}

/** @deprecated Use AgentInjector — kept for migration references. */
export interface DynamicInjector {
  readonly id: string
  inject(context: InjectionContext): ModelMessage | null | Promise<ModelMessage | null>
}
