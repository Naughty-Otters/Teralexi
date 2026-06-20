import { Output } from '@openfde-ai'
import type { StreamTextParams } from '../llm/runtime'
import { z } from 'zod'
import type { AgentStepContext } from '../context'
import { SKILLS_TOOL_EXECUTION_LLM } from '../constants/skills-tool-llm'
import {
  formatTodoGoalForFormSubmitResume,
  formatTodoGoalForInstructions,
} from './step-helpers'

import type { ToolLoopFailureKind } from '../expr/tool-loop-fallback'
import type { ClassifiedError } from '../providers/error-classifier'

/** Result returned by a single todo execution (no verification, no retry). */
export type TodoExecutionResult = {
  output: string
  awaitingToolApproval: boolean
  failureKind?: ToolLoopFailureKind
  classifiedError?: ClassifiedError
}

/** Result of LLM-based verification of a todo step output. */
export type TodoVerificationResult = {
  valid: boolean
  summary: string
}

/**
 * LLM-based verification: checks whether a todo's output satisfies its success criteria.
 * Extracted from SkillsToolExecutionStep so it can be called by the orchestrator.
 */
export async function verifyTodoResult(
  ctx: AgentStepContext,
  input: {
    todoName: string
    todoDescription: string
    successCriteria: string
    output: string
    route?: 'normal' | 'tool-approval' | 'form-submit'
  },
): Promise<TodoVerificationResult> {
  const verificationOutputSpec = (Output.object as any)({
    schema: z.object({
      valid: z.boolean(),
      summary: z.string().min(1),
    }),
  })

  const stepGoalBlock =
    input.route === 'form-submit'
      ? formatTodoGoalForFormSubmitResume(
          { name: input.todoName, description: '', success_criteria: '' },
          { mode: 'verify' },
        )
      : formatTodoGoalForInstructions({
          name: input.todoName,
          description: input.todoDescription,
          success_criteria: input.successCriteria,
        })

  const { output: parsed } = await ctx.providers.streamObjectToStepProgress<{
    valid: boolean
    summary: string
  }>(ctx, {
    model: ctx.resolveStageModel('verifier'),
    system: ctx.config.withResponseLanguageInstruction(
      SKILLS_TOOL_EXECUTION_LLM.VERIFIER_SYSTEM,
      ctx.opts.responseLanguage,
    ),
    messages: [
      {
        role: 'user' as const,
        content: `${SKILLS_TOOL_EXECUTION_LLM.VERIFIER_USER_PREFIX}\n\n${stepGoalBlock}\n\n${SKILLS_TOOL_EXECUTION_LLM.VERIFIER_USER_EXECUTION_LABEL}\n${input.output}`,
      },
    ],
    output: verificationOutputSpec,
    abortSignal: ctx.opts.abortSignal,
  } as StreamTextParams)

  return {
    valid: parsed.valid,
    summary: parsed.summary.trim(),
  }
}
