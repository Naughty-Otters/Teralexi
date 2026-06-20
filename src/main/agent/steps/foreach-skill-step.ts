import type { AgentMessage, AssistantSubStep, SkillChainPlan, StepRunCapture } from '../types'
import type { AgentFlowContext } from '../context'
import type { StepExpressionDefinition, StepRunContext } from '../flow/step-hook'
import type { StepOutputEntry } from './step-io'
import {
  FOREACH_SKILL_STEP_ID,
  FOREACH_SKILL_STEP_TITLE,
} from '../constants/step-ids'
import { mergeSubFlowOutputText, resolveEngineAgent } from '../run/resolve-child-agent'

type ForEachSkillStepData = {
  tasks: SkillChainPlan['tasks']
  results: Array<[string, string]>
}

function buildContextMessages(ctx: AgentFlowContext): AgentMessage[] {
  return ctx.buildPipelineContextMessages({
    thinking: true,
    planning: true,
    execution: true,
    orderedExecution: true,
    summary: true,
  })
}

export const forEachSkillStepDefinition: StepExpressionDefinition = {
  id: FOREACH_SKILL_STEP_ID,
  title: FOREACH_SKILL_STEP_TITLE,

  shouldRun(run: StepRunContext): boolean {
    return Boolean(run.flow.skillChainPlan?.tasks?.length)
  },

  async run(run: StepRunContext): Promise<void> {
    const parentCtx = run.flow
    const plan = parentCtx.skillChainPlan
    if (!plan?.tasks?.length) return

    const parentRun = parentCtx.agentRun
    if (!parentRun) {
      throw new Error(
        'forEachSkill step requires an active AgentRun (execute via AgentRun.execute or streamAgentResponse)',
      )
    }

    const stepCtx = parentCtx.createStepContext(
      FOREACH_SKILL_STEP_ID,
      FOREACH_SKILL_STEP_TITLE,
      run.config,
    )
    stepCtx.beginStep(FOREACH_SKILL_STEP_ID, FOREACH_SKILL_STEP_TITLE)

    for (const task of plan.tasks) {
      const agent = await resolveEngineAgent(parentCtx.opts.userId, task.agentId)
      const title = `Running ${agent.name}`

      const priorResultMessages: AgentMessage[] = [
        ...parentCtx.skillChainResults.entries(),
      ].map(([agentId, output]) => ({
        role: 'user' as const,
        content: `Result from agent "${agentId}":\n\n${output}`,
      }))

      const contextMessages: AgentMessage[] = [
        ...buildContextMessages(parentCtx),
        ...priorResultMessages,
      ]

      const result = await parentRun.executeChildAndMerge({
        agentId: task.agentId,
        parentOpts: parentCtx.opts,
        task: task.task,
        contextMessages,
        parentHitlPauseStageId: FOREACH_SKILL_STEP_ID,
      })

      if (result.hitlPaused) {
        parentCtx.hitlAwaitingApproval = true
        return
      }

      const merged = mergeSubFlowOutputText(result.stepOutputs, 'report')
      parentCtx.skillChainResults.set(task.agentId, merged)
      parentCtx.appendAssistantTurn(`## ${title}\n\n${merged}`)
    }

    const allResults: Array<[string, string]> = [...parentCtx.skillChainResults.entries()]
    const aggregateText = allResults
      .map(([agentId, output]) => `### ${agentId}\n\n${output}`)
      .join('\n\n---\n\n')

    parentCtx.recordStepOutput(
      FOREACH_SKILL_STEP_ID,
      FOREACH_SKILL_STEP_TITLE,
      { tasks: plan.tasks, results: allResults } satisfies ForEachSkillStepData,
      aggregateText,
      undefined,
      'Execute each skill agent in sequence and thread results.',
      `Completed ${plan.tasks.length} skill step(s).`,
    )
  },

  toContextMessages(entries: StepOutputEntry[]): AgentMessage[] {
    const last = entries[entries.length - 1]?.data as ForEachSkillStepData | undefined
    if (!last?.results?.length) return []
    const text = last.results
      .map(([agentId, output]) => `[${agentId} output]:\n${output}`)
      .join('\n\n')
    return [{ role: 'user', content: `Skill agent results:\n\n${text}` }]
  },

  toSubStep(entries: StepOutputEntry[]): AssistantSubStep | null {
    const last = entries[entries.length - 1]?.data as ForEachSkillStepData | undefined
    if (!last?.results?.length) return null
    const content = last.results
      .map(([agentId, output]) => `**${agentId}**:\n${output}`)
      .join('\n\n')
    return {
      type: 'SkillsToolExecutionStep',
      title: FOREACH_SKILL_STEP_TITLE,
      content,
    }
  },

  toStepCapture(entries: StepOutputEntry[]): StepRunCapture | null {
    const last = entries[entries.length - 1]?.data as ForEachSkillStepData | undefined
    if (!last?.results?.length) return null
    const content = last.results
      .map(([agentId, output]) => `**${agentId}**:\n${output}`)
      .join('\n\n')
    return {
      stepType: 'SkillsToolExecutionStep',
      title: FOREACH_SKILL_STEP_TITLE,
      content,
      outputPaths: [],
    }
  },

  hasOutput(entries: StepOutputEntry[]): boolean {
    const last = entries[entries.length - 1]?.data as ForEachSkillStepData | undefined
    return Boolean(last?.results?.length)
  },
}
