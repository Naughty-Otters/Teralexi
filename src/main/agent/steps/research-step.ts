import type { AgentFlowContext, AgentStepContext } from '../context'
import type { StepExpressionDefinition, StepRunContext } from '../flow/step-hook'
import { withStepToolScope } from '../expr/expression-runner'
import { PIPELINE_CONTEXT_LLM } from '../constants'
import {
  RESEARCH_STEP_ID,
  RESEARCH_STEP_TITLE,
} from '../constants/step-ids'
import { AgentStep } from './agent-step'
import { asResearchStepContext, ResearchStepContext } from './research/research-step-context'
import type { StepOutputEntry, ResearchStepData } from './step-io'
import type { AgentMessage, AssistantSubStep, StepRunCapture } from '../types'
import {
  researchConfigFromFlowConfig,
  resolveResearchConfig,
} from './research/config'
import { maybeScheduleResearchHandoff } from './research/handoff'
import { savePendingApprovalState } from './pending-state'
import { runResearchLoop } from './research/loop'

function hasResearchTools(ctx: AgentFlowContext, toolNames: string[]): boolean {
  const available = ctx.opts.availableSet ?? []
  if (available.length === 0) return true
  return toolNames.some((name) => available.includes(name))
}

export class ResearchOrchestrator extends AgentStep {
  protected readonly researchCtx: ResearchStepContext

  constructor(ctx: AgentStepContext) {
    super(ctx)
    this.researchCtx = asResearchStepContext(ctx)
  }

  shouldRun(): boolean {
    const config = researchConfigFromFlowConfig(this.ctx.flowStepConfig)
    const resolved = resolveResearchConfig(config, this.ctx.agentFlow)
    if (!resolved.topic.trim()) return false
    return hasResearchTools(this.ctx.agentFlow, resolved.tools)
  }

  async execute(): Promise<void> {
    const flowConfig = this.ctx.flowStepConfig
    const config = resolveResearchConfig(
      researchConfigFromFlowConfig(flowConfig),
      this.ctx.agentFlow,
    )

    if (!config.topic.trim()) {
      throw new Error('Research stage requires a topic or user message.')
    }

    if (!hasResearchTools(this.ctx.agentFlow, config.tools)) {
      throw new Error(
        `Research stage requires at least one of: ${config.tools.join(', ')}`,
      )
    }

    const title =
      flowConfig?.title?.trim() || RESEARCH_STEP_TITLE

    await withStepToolScope(this.ctx.agentFlow, config.tools, async () => {
      const result = await runResearchLoop(this.researchCtx, config)

      if (result.paused) {
        savePendingApprovalState(this.researchCtx)
        return
      }

      const data: ResearchStepData = {
        topic: result.topic,
        findings: result.findings,
        digestMarkdown: result.digestMarkdown,
        rendered: result.digestMarkdown,
        text: result.digestMarkdown,
      }

      this.ctx.recordStepOutput(
        RESEARCH_STEP_ID,
        title,
        data,
        result.digestMarkdown,
      )

      maybeScheduleResearchHandoff(this.ctx, config, result.digestMarkdown)
    })
  }
}

function getResearchDigest(entries: StepOutputEntry[]): string {
  return entries
    .map((e) => {
      const data = e.data as ResearchStepData
      return data.digestMarkdown?.trim() || data.text?.trim() || data.rendered?.trim()
    })
    .filter(Boolean)
    .join('\n\n')
}

export const researchFlowStepDefinition: StepExpressionDefinition = {
  id: RESEARCH_STEP_ID,
  title: RESEARCH_STEP_TITLE,
  hitlPausePoint: true,
  mergeStrategy: 'aggregate',
  shouldRun(run) {
    const config = researchConfigFromFlowConfig(run.config)
    const resolved = resolveResearchConfig(config, run.flow)
    if (!resolved.topic.trim()) return false
    return hasResearchTools(run.flow, resolved.tools)
  },
  run: async (run: StepRunContext) => {
    const step = new ResearchOrchestrator(
      run.flow.createStepContext(
        RESEARCH_STEP_ID,
        run.config?.title?.trim() || RESEARCH_STEP_TITLE,
        run.config,
      ),
    )
    if (step.shouldRun()) await step.execute()
  },

  toContextMessages(entries: StepOutputEntry[]): AgentMessage[] {
    const digest = getResearchDigest(entries)
    if (!digest) return []
    return [
      {
        role: 'user',
        content: `${PIPELINE_CONTEXT_LLM.RESEARCH_OUTPUT}\n\n${digest}`,
      },
    ]
  },

  toSubStep(entries: StepOutputEntry[]): AssistantSubStep | null {
    const digest = getResearchDigest(entries)
    if (!digest) return null
    return {
      type: 'ResearchStep',
      title: RESEARCH_STEP_TITLE,
      content: digest,
    }
  },

  toStepCapture(entries: StepOutputEntry[]): StepRunCapture | null {
    const digest = getResearchDigest(entries)
    if (!digest) return null
    return {
      stepType: 'ResearchStep',
      title: RESEARCH_STEP_TITLE,
      content: digest,
    }
  },

  hasOutput(entries: StepOutputEntry[]): boolean {
    return entries.some((e) => {
      const data = e.data as ResearchStepData
      return Boolean(
        data.digestMarkdown?.trim() ||
          data.text?.trim() ||
          data.rendered?.trim(),
      )
    })
  },
}
