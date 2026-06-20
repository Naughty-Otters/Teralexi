import type { PendingRunFrame } from '../run/types'
import type { ResearchResumeState } from '../steps/research/config'
import type {
  AgentMessage,
  AgentStepContextHistory,
  AgentStepContextMap,
  StepOutputs,
} from '../types'
import type { ParsedCollectFormSchema } from '../form/schema'

export type PendingAgentExecution = {
  currentMessages: AgentMessage[]
  stepOutputs: StepOutputs
  stepContexts: AgentStepContextMap
  stepHistory: AgentStepContextHistory
  /** 0-based index into `planning.todoList` — resume batch from this todo after HITL. */
  nextTodoIndex: number
  pendingFormRequestId?: string
  pendingFormTodoId?: number
  /** Todo id that was waiting on tool approval when this snapshot was taken. */
  pendingApprovalTodoId?: number
  /** Todo failed with fallback_plan manual_intervention; resume after user follow-up. */
  awaitingManualIntervention?: boolean
  pendingManualInterventionTodoId?: number
  /** Values already submitted for earlier todos in this run (same assistant message). */
  collectedFormByTodoId: Record<number, Record<string, unknown>>
  /** Pipeline stage id where HITL paused; used to resume execution from the same stage. */
  pausedStageId?: string
  /** Nested sub-agent runs paused for HITL (resume top frame before parent). */
  runStack?: PendingRunFrame[]
  /** Active nested run id when `runStack` is non-empty. */
  activeRunId?: string
  /** Research loop snapshot when HITL paused mid-research. */
  researchResumeState?: ResearchResumeState
  /**
   * LLM-generated form schemas keyed by todo id.
   * Persisted so schemas survive across HITL pauses without needing regeneration.
   */
  generatedFormSchemas?: Record<number, ParsedCollectFormSchema>
}
