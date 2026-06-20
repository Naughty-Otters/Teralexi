import type { AgentFlowContext } from '../context'
import type { FlowStageId } from '../constants/step-ids'
import type { FlowStepConfig } from './pipeline'
import type { MergeStrategy, StepOutputEntry } from '../steps/step-io'
import type { AgentMessage, AssistantSubStep, StepRunCapture } from '../types'

/** Runtime context for a single pipeline stage execution. */
export type StepRunContext = {
  flow: AgentFlowContext
  config: FlowStepConfig
}

/** Return assistant content to stop the pipeline early; `null` continues. */
export type StepAfterHook = (run: StepRunContext) => Promise<string | null>

/**
 * Pipeline stage hook: id, title, and {@link run}.
 * Expression LLM stages extend {@link StepHookBase}; imperative stages use a plain object.
 */
export type StepExpressionDefinition = {
  id: FlowStageId
  title: string
  shouldRun?: (run: StepRunContext) => boolean
  run: (run: StepRunContext) => Promise<void>
  after?: StepAfterHook
  /** If true, the pipeline checks for HITL pause after this stage runs. */
  hitlPausePoint?: boolean

  /** How multiple outputs are resolved: 'latest' (default) keeps only the last; 'aggregate' keeps all. */
  mergeStrategy?: MergeStrategy
  /** Render this step's outputs into context messages for downstream LLM calls. */
  toContextMessages?: (entries: StepOutputEntry[], ctx: AgentFlowContext) => AgentMessage[]
  /** Produce a structured sub-step for the final assistant content. */
  toSubStep?: (entries: StepOutputEntry[], ctx: AgentFlowContext) => AssistantSubStep | null
  /** Produce a step capture for structured content output. */
  toStepCapture?: (entries: StepOutputEntry[], ctx: AgentFlowContext) => StepRunCapture | null
  /** Whether this step has meaningful output (used for conditional checks). */
  hasOutput?: (entries: StepOutputEntry[]) => boolean
}
