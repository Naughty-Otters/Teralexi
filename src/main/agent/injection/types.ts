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
  applies(context: InjectionRunContext): boolean
  injectInstructions?(
    context: InjectionRunContext,
  ): string | null | Promise<string | null>
  injectMessages?(
    context: InjectionRunContext,
  ): ModelMessage | null | Promise<ModelMessage | null>
  onPrepareStep?(
    context: InjectionRunContext,
    step: PrepareStepContext,
  ): PrepareStepSlice | undefined | Promise<PrepareStepSlice | undefined>
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
