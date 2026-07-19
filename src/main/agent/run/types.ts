import type { FlowStageId } from '../constants/step-ids'
import type {
  AgentMessage,
  AgentStepContextHistory,
  AgentStepContextMap,
  StepOutputs,
} from '../types'

export type AgentRunId = string

export type AgentRunMeta = {
  runId: AgentRunId
  parentRunId?: AgentRunId
  depth: number
  agentId?: string
  conversationId?: string
  assistantMessageId?: string
}

export type AgentRunResult = {
  structuredContent: string
  stepOutputs: StepOutputs
  hitlPaused: boolean
  /** Scoped `flowId:stageId` where this run paused for HITL. */
  pausedStageId?: string
  /** When false, callers must skip agent memory persistence for this run. */
  shouldPersistMemory: boolean
}

/** Snapshot of a nested run paused for HITL (resume child before parent). */
export type PendingRunFrame = {
  runId: AgentRunId
  agentId?: string
  pausedStageId?: string
  currentMessages: AgentMessage[]
  stepOutputs: StepOutputs
  stepContexts: AgentStepContextMap
  stepHistory: AgentStepContextHistory
  nextTodoIndex?: number
  pendingFormRequestId?: string
  pendingFormTodoId?: number
  pendingApprovalTodoId?: number
  collectedFormByTodoId: Record<number, Record<string, unknown>>
}

export const MAX_AGENT_RUN_DEPTH = 2

export const MAX_PARALLEL_SUB_AGENT_RUNS = 10

export {
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_AGENTS_TOOL_NAME,
  WAIT_FOR_SUB_AGENT_RUNS_TOOL_NAME,
  BEST_OF_N_TOOL_NAME,
} from '@toolSet/sub-agents'
