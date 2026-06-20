import {
  SKILLS_STEP_ID,
  TOOL_LOOP_STEP_ID,
  TOOL_LOOP_STEP_TITLE,
} from '../constants/step-ids'
import {
  executeToolLoopStage,
  toolLoopStageShouldRun,
} from '../expr/tool-loop-expr'
import { withStepToolScope } from '../expr/expression-runner'
import type { StepExpressionDefinition, StepRunContext } from './step-hook'
import type { StepOutputEntry, TextStepData } from '../steps/step-io'
import type { AgentFlowContext } from '../context'
import type { AgentMessage, AssistantSubStep, StepRunCapture } from '../types'
import { PIPELINE_CONTEXT_LLM } from '../constants'
import { collectSandboxOutputLinkPaths } from '../sandbox/step-output-links'

async function runAgentFlowStep(run: StepRunContext): Promise<void> {
  await withStepToolScope(run.flow, run.config.stepTools, async () => {
    await executeToolLoopStage(
      run.flow.createStepContext(
        TOOL_LOOP_STEP_ID,
        TOOL_LOOP_STEP_TITLE,
        run.config,
      ),
    )
  })
}

function getToolLoopText(entries: StepOutputEntry[]): string {
  return entries
    .map((e) => (e.data as TextStepData).text?.trim())
    .filter(Boolean)
    .join('\n\n')
}

/** Built-in tool-loop flow step. Picks between expression-based and skills-based execution. */
export const toolLoopFlowStepDefinition: StepExpressionDefinition = {
  id: TOOL_LOOP_STEP_ID,
  title: TOOL_LOOP_STEP_TITLE,
  hitlPausePoint: true,
  mergeStrategy: 'aggregate',
  shouldRun: (run) => toolLoopStageShouldRun(run.flow),
  run: runAgentFlowStep,

  toContextMessages(entries: StepOutputEntry[], ctx: AgentFlowContext): AgentMessage[] {
    const messages: AgentMessage[] = []
    const skillsEntries = ctx.outputStore.all(SKILLS_STEP_ID)
    const skillsText = skillsEntries
      .map((e) => (e.data as TextStepData).text?.trim())
      .filter(Boolean)
      .join('\n\n')
    if (skillsText) {
      messages.push({ role: 'user', content: `${PIPELINE_CONTEXT_LLM.SKILLS_OUTPUT}\n\n${skillsText}` })
    }
    const toolText = getToolLoopText(entries)
    if (toolText) {
      messages.push({ role: 'user', content: `${PIPELINE_CONTEXT_LLM.TOOL_EXECUTION_OUTPUT}\n\n${toolText}` })
    }
    return messages
  },

  toSubStep(entries: StepOutputEntry[], ctx: AgentFlowContext): AssistantSubStep | null {
    const skillsEntries = ctx.outputStore.all(SKILLS_STEP_ID)
    const skillsText = skillsEntries
      .map((e) => (e.data as TextStepData).text?.trim())
      .filter(Boolean)
      .join('\n\n')
    const toolText = getToolLoopText(entries)
    const content = [toolText, skillsText].filter(Boolean).join('\n\n').trim()
    if (!content) return null
    return { type: 'SkillsToolExecutionStep', title: TOOL_LOOP_STEP_TITLE, content }
  },

  toStepCapture(entries: StepOutputEntry[], ctx: AgentFlowContext): StepRunCapture | null {
    const skillsEntries = ctx.outputStore.all(SKILLS_STEP_ID)
    const skillsText = skillsEntries
      .map((e) => (e.data as TextStepData).text?.trim())
      .filter(Boolean)
      .join('\n\n')
    const toolText = getToolLoopText(entries)
    const content = [toolText, skillsText].filter(Boolean).join('\n\n').trim()
    if (!content) return null
    const sandboxOutputPaths = collectSandboxOutputLinkPaths(ctx.sandbox)
    return {
      stepType: 'SkillsToolExecutionStep',
      title: TOOL_LOOP_STEP_TITLE,
      content,
      outputPaths: sandboxOutputPaths.length > 0 ? [...sandboxOutputPaths] : [],
    }
  },

  hasOutput(entries: StepOutputEntry[]): boolean {
    return entries.some((e) => Boolean((e.data as TextStepData).text?.trim()))
  },
}
