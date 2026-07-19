import type { AgentMessage, AssistantSubStep, StepRunCapture } from '../types'
import type { AgentFlowContext } from '../context'
import type { StepExpressionDefinition, StepRunContext } from '../flow/step-hook'
import type { StepOutputEntry } from './step-io'
import { SUB_FLOW_STEP_ID } from '../constants/step-ids'
import {
  formatSubFlowStepTitle,
  mergeSubFlowOutputText,
  resolveSubAgentSummaryText,
  resolveEngineAgent,
} from '../run/resolve-child-agent'
import type { SubFlowConfig, SubFlowMergeOutputs } from './sub-flow-config'

function configFromRun(run: StepRunContext): SubFlowConfig | undefined {
  const raw = run.config?.subFlow
  if (!raw || typeof raw !== 'object') return undefined
  const agentId = (raw as SubFlowConfig).agentId
  if (typeof agentId !== 'string' || !agentId.trim()) return undefined
  return raw as SubFlowConfig
}

function buildTask(run: StepRunContext, config: SubFlowConfig): string {
  if (config.task?.trim()) return config.task.trim()
  return run.flow.getLatestUserMessageContent()
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

export const subFlowFlowStepDefinition: StepExpressionDefinition = {
  id: SUB_FLOW_STEP_ID,
  title: 'Sub-agent',

  shouldRun(run: StepRunContext): boolean {
    return Boolean(configFromRun(run)?.agentId?.trim())
  },

  async run(run: StepRunContext): Promise<void> {
    const config = configFromRun(run)
    if (!config) return

    const parentCtx = run.flow
    const parentRun = parentCtx.agentRun
    if (!parentRun) {
      throw new Error(
        'Sub-flow step requires an active AgentRun (execute via AgentRun.execute or streamAgentResponse)',
      )
    }

    const agent = await resolveEngineAgent(parentCtx.opts.userId, config.agentId)
    const title = formatSubFlowStepTitle(agent)
    const stepCtx = parentCtx.createStepContext(SUB_FLOW_STEP_ID, title, run.config)
    stepCtx.beginStep()

    const task = buildTask(run, config)
    const merge: SubFlowMergeOutputs = config.mergeOutputs ?? 'report'

    const result = await parentRun.executeChildAndMerge({
      agentId: config.agentId,
      parentOpts: parentCtx.opts,
      task,
      contextMessages: buildContextMessages(parentCtx),
      parentHitlPauseStageId: SUB_FLOW_STEP_ID,
    })

    if (result.hitlPaused) {
      parentCtx.hitlAwaitingApproval = true
      return
    }

    const mergedText =
      merge === 'summary'
        ? mergeSubFlowOutputText(result.stepOutputs, 'summary')
        : resolveSubAgentSummaryText(result.stepOutputs)
    parentCtx.recordStepOutput(
      SUB_FLOW_STEP_ID,
      title,
      { agentId: config.agentId, output: mergedText, childStepOutputs: result.stepOutputs },
      mergedText,
      { childAgentId: config.agentId },
      stepCtx.stepInstanceKey,
      mergedText.slice(0, 200),
    )
    parentCtx.appendAssistantTurn(mergedText)
  },

  toContextMessages(entries: StepOutputEntry[]): AgentMessage[] {
    const last = entries[entries.length - 1]?.data as { output?: string } | undefined
    const text = last?.output?.trim()
    if (!text) return []
    return [{ role: 'user', content: `Sub-agent result:\n\n${text}` }]
  },

  toSubStep(entries: StepOutputEntry[]): AssistantSubStep | null {
    const last = entries[entries.length - 1]?.data as { output?: string } | undefined
    const text = last?.output?.trim()
    if (!text) return null
    return { type: 'SkillsToolExecutionStep', title: 'Sub-agent', content: text }
  },

  toStepCapture(entries: StepOutputEntry[]): StepRunCapture | null {
    const last = entries[entries.length - 1]?.data as { output?: string } | undefined
    const text = last?.output?.trim()
    if (!text) return null
    return {
      stepType: 'SkillsToolExecutionStep',
      title: 'Sub-agent',
      content: text,
      outputPaths: [],
    }
  },

  hasOutput(entries: StepOutputEntry[]): boolean {
    const last = entries[entries.length - 1]?.data as { output?: string } | undefined
    return Boolean(last?.output?.trim())
  },
}
