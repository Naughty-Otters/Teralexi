import type { AgentMessage, AssistantSubStep, StepRunCapture } from '../types'
import type { AgentStepContext } from '../context'
import type { StepExpressionPlan } from './expression-plan'
import { expressionPlanIsRunnable } from './expression-plan'
import { StepExpressionDefinitionBase } from './step-expr-base'
import type { StepExpressionDefinition, StepRunContext } from '../flow/step-hook'
import type { StepHookResult } from './step-hook-types'
import type { FlowStepConfig } from '../flow/pipeline'
import { PROMPT_STEP_ID, PROMPT_STEP_TITLE } from '../constants/step-ids'
import type { StepOutputEntry, TextStepData } from '../steps/step-io'

function legacyCustomPromptRunnable(config: FlowStepConfig): boolean {
  return Boolean(
    config.systemMessage?.trim() && config.instructions?.trim(),
  )
}

class CustomPromptStep extends StepExpressionDefinitionBase {
  readonly id = PROMPT_STEP_ID
  readonly title = PROMPT_STEP_TITLE

  shouldRun(run: StepRunContext): boolean {
    return (
      expressionPlanIsRunnable(run.config.expressionPlan) ||
      legacyCustomPromptRunnable(run.config)
    )
  }

  protected defaultInstruction(ctx: AgentStepContext): string {
    return ctx.flowStepConfig?.systemMessage?.trim() ?? ''
  }

  protected defaultUserPrompt(ctx: AgentStepContext): string {
    return ctx.flowStepConfig?.instructions?.trim() ?? ''
  }

  protected resolvePlanTitle(ctx: AgentStepContext): string {
    const title = ctx.flowStepConfig?.title?.trim()
    return title || PROMPT_STEP_TITLE
  }

  buildMessages(ctx: AgentStepContext): AgentMessage[] {
    const userContent = ctx.flowStepConfig?.instructions?.trim() ?? ''
    return [
      {
        role: 'user',
        content: ctx.getLatestUserMessageContent(),
      },
      ...ctx.buildPipelineContextMessages({
        thinking: true,
        planning: true,
        execution: true,
        orderedExecution: true,
        summary: true,
      }),
      {
        role: 'user',
        content: userContent,
      },
    ]
  }

  recordResult(ctx: AgentStepContext, result: StepHookResult): void {
    const output = result.formatted
    ctx.recordStepOutput(
      this.id,
      result.displayTitle,
      output,
      output,
      undefined,
      result.stepGoal,
      output,
    )
    if (output.trim()) {
      ctx.appendAssistantTurn(output)
    }
  }

  stepGoal(ctx: AgentStepContext): string | undefined {
    return (
      ctx.flowStepConfig?.instructions?.trim() ||
      ctx.flowStepConfig?.expressionPlan?.userPrompt?.trim()
    )
  }

  toContextMessages(): AgentMessage[] {
    return []
  }

  toSubStep(entries: StepOutputEntry[]): AssistantSubStep | null {
    const last = entries[entries.length - 1]?.data as TextStepData | undefined
    const text = last?.text?.trim()
    if (!text) return null
    return { type: 'SkillsToolExecutionStep', title: 'Custom Prompt', content: text }
  }

  toStepCapture(entries: StepOutputEntry[]): StepRunCapture | null {
    const last = entries[entries.length - 1]?.data as TextStepData | undefined
    const text = last?.text?.trim()
    if (!text) return null
    return { stepType: 'SkillsToolExecutionStep', title: 'Custom Prompt', content: text, outputPaths: [] }
  }

  hasOutput(entries: StepOutputEntry[]): boolean {
    const last = entries[entries.length - 1]?.data as TextStepData | undefined
    return Boolean(last?.text?.trim())
  }
}

const customPromptHooks = new CustomPromptStep()

/** Built-in custom-prompt pipeline stage ({@link AgentFlow.customStep}). */
export const customPromptFlowStepDefinition: StepExpressionDefinition = customPromptHooks
