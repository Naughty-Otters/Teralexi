import type { AgentStepId } from '../../constants/step-ids'
import { RESEARCH_STEP_ID } from '../../constants/step-ids'
import {
  AgentFlowContext,
  AgentStepContext,
  registerStepContextCreator,
} from '../../context'
import type { FlowStepConfig } from '../../flow/pipeline'
import type { ResearchResumeState } from './config'

/**
 * Step context for the iterative research loop ({@link RESEARCH_STEP_ID}).
 * Holds resume state for HITL tool approval mid-research.
 */
export class ResearchStepContext extends AgentStepContext {
  constructor(
    flowContext: AgentFlowContext,
    stepId: AgentStepId,
    title: string,
    instanceKey: string,
    flowStepConfig?: FlowStepConfig,
  ) {
    super(flowContext, stepId, title, instanceKey, flowStepConfig)
  }

  get researchResumeState(): ResearchResumeState | undefined {
    return this.flowContext.researchResumeState
  }

  set researchResumeState(value: ResearchResumeState | undefined) {
    this.flowContext.researchResumeState = value
  }

  clearResearchResumeState(): void {
    this.researchResumeState = undefined
  }
}

export function asResearchStepContext(
  ctx: AgentStepContext,
): ResearchStepContext {
  if (ctx instanceof ResearchStepContext) return ctx
  throw new Error('Expected ResearchStepContext for research pipeline step')
}

registerStepContextCreator(
  RESEARCH_STEP_ID,
  (flowContext, stepId, title, instanceKey, flowStepConfig) =>
    new ResearchStepContext(
      flowContext,
      stepId,
      title,
      instanceKey,
      flowStepConfig,
    ),
)
