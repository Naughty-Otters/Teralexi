import {
  resolvePipelineStepInput,
  type StepExpression,
} from '../expr/step-expression'
import type { FlowStageId } from '../constants/step-ids'
import type { FlowStepConfig, PipelineEntry } from './pipeline'
import type { StepExpressionDefinition } from './step-hook'

/** Pipeline row: expression/config from {@link StepExpression} plus stage runner from expr modules. */
export function buildPipelineEntry(
  stageId: FlowStageId,
  runner: StepExpressionDefinition,
  input?: StepExpression | FlowStepConfig,
): PipelineEntry {
  return {
    ...resolvePipelineStepInput(stageId, input),
    runner,
  }
}
