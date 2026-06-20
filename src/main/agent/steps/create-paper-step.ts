import { mkdir } from 'node:fs/promises'
import { createLogger, instrumentInstanceMethods } from '@main/logger'
import type { AgentStepContext } from '../context'
import type { StepExpressionDefinition, StepRunContext } from '../flow/step-hook'
import { PIPELINE_CONTEXT_LLM } from '../constants'
import {
  CREATE_PAPER_STEP_ID,
  CREATE_PAPER_STEP_TITLE,
  SEARCH_STEP_ID,
  WEB_SCRAPE_STEP_ID,
} from '../constants/step-ids'
import { AgentStep } from './agent-step'
import type { StepOutputEntry, CreatePaperStepData } from './step-io'
import type { AgentMessage, AssistantSubStep, StepRunCapture } from '../types'
import {
  createPaperConfigFromFlowConfig,
  resolveCreatePaperConfig,
} from './create-paper-config'
import { collectPaperInputs } from './create-paper/collect-sources'
import { generateResearchPaperMarkdown } from './create-paper/create-paper-llm'
import { appendPaperReferences } from './create-paper/paper-references'
import {
  formatCreatePaperDigest,
  formatCreatePaperProgress,
} from './create-paper/format-paper'
import { exportMarkdownBodyToPdf } from '../sandbox/markdown-to-pdf'
import { createPaperOutputDir, createPaperOutputPath } from './create-paper/paths'
import type { SearchStepData } from './step-io'

const log = createLogger('agent.steps.create-paper')

function hasPriorResearchOutput(ctx: AgentStepContext): boolean {
  const search = ctx.outputStore.latest<SearchStepData>(SEARCH_STEP_ID)
  if (search?.topic?.trim()) return true
  return ctx.outputStore.all(WEB_SCRAPE_STEP_ID).length > 0
}

export class CreatePaperOrchestrator extends AgentStep {
  constructor(ctx: AgentStepContext) {
    super(ctx)
    instrumentInstanceMethods(this, log)
  }

  shouldRun(): boolean {
    if (!hasPriorResearchOutput(this.ctx)) return false
    const config = resolveCreatePaperConfig(
      createPaperConfigFromFlowConfig(this.ctx.flowStepConfig),
      this.ctx.flowContext,
    )
    return Boolean(config.topic.trim())
  }

  async execute(): Promise<void> {
    const flowConfig = this.ctx.flowStepConfig
    const config = resolveCreatePaperConfig(
      createPaperConfigFromFlowConfig(flowConfig),
      this.ctx.flowContext,
    )

    if (!config.topic.trim()) {
      throw new Error('Create paper requires a research topic from search or thinking.')
    }

    const sandboxRoot = this.ctx.sandbox.getRoot()
    if (!sandboxRoot) {
      throw new Error('Create paper requires an active sandbox.')
    }

    const title = flowConfig?.title?.trim() || CREATE_PAPER_STEP_TITLE
    const goal = `Write a research paper on: ${config.topic}`

    this.ctx.beginStep(CREATE_PAPER_STEP_ID, title, undefined, goal)
    this.ctx.emitStepProgress(
      `\n📄 Preparing research paper for: ${config.topic}\n\n`,
    )

    const inputs = await collectPaperInputs(this.ctx.flowContext, config)

    if (inputs.sources.length === 0) {
      this.ctx.emitStepProgress(
        `\n⚠ No downloaded pages with usable content. The report will note this limitation (search summaries are not used as evidence).\n\n`,
      )
    } else if (inputs.skippedWithoutDownload > 0) {
      this.ctx.emitStepProgress(
        `Using ${inputs.sources.length} downloaded page(s) (${inputs.skippedWithoutDownload} search hit(s) skipped — no full text). Drafting paper…\n\n`,
      )
    } else {
      this.ctx.emitStepProgress(
        `Using ${inputs.sources.length} downloaded page(s). Drafting paper from scraped content…\n\n`,
      )
    }

    const paperMarkdown = appendPaperReferences(
      await generateResearchPaperMarkdown(
        this.ctx,
        inputs,
        config.paperPrompt,
      ),
      inputs,
    )

    const outputPath = createPaperOutputPath(sandboxRoot, config.outputFileName)
    await mkdir(createPaperOutputDir(sandboxRoot), { recursive: true })
    await exportMarkdownBodyToPdf(paperMarkdown, outputPath, 'research-report')

    const rendered = formatCreatePaperDigest({
      topic: inputs.topic,
      abstraction: inputs.abstraction,
      sourceCount: inputs.sources.length,
      outputPath,
      paperMarkdown,
    })

    this.ctx.emitStepProgress(
      `${formatCreatePaperProgress(inputs, outputPath)}\n${rendered}`,
    )

    const data: CreatePaperStepData = {
      topic: inputs.topic,
      abstraction: inputs.abstraction,
      sourceCount: inputs.sources.length,
      outputPath,
      paperMarkdown,
      rendered,
      text: rendered,
    }

    this.ctx.recordStepOutput(
      CREATE_PAPER_STEP_ID,
      title,
      data,
      rendered,
      { outputPath },
    )
    this.ctx.appendAssistantTurn(rendered)
  }
}

function getCreatePaperDigest(entries: StepOutputEntry[]): string {
  return entries
    .map((e) => {
      const data = e.data as CreatePaperStepData
      return data.text?.trim() || data.rendered?.trim()
    })
    .filter(Boolean)
    .join('\n\n')
}

export const createPaperFlowStepDefinition: StepExpressionDefinition = {
  id: CREATE_PAPER_STEP_ID,
  title: CREATE_PAPER_STEP_TITLE,

  shouldRun(run) {
    const config = resolveCreatePaperConfig(
      createPaperConfigFromFlowConfig(run.config),
      run.flow,
    )
    if (!config.topic.trim()) return false
    const search = run.flow.outputStore.latest<SearchStepData>(SEARCH_STEP_ID)
    if (search?.topic?.trim()) return true
    return run.flow.outputStore.all(WEB_SCRAPE_STEP_ID).length > 0
  },

  run: async (run: StepRunContext) => {
    const step = new CreatePaperOrchestrator(
      run.flow.createStepContext(
        CREATE_PAPER_STEP_ID,
        run.config?.title?.trim() || CREATE_PAPER_STEP_TITLE,
        run.config,
      ),
    )
    if (step.shouldRun()) await step.execute()
  },

  toContextMessages(entries: StepOutputEntry[]): AgentMessage[] {
    const digest = getCreatePaperDigest(entries)
    if (!digest) return []
    return [
      {
        role: 'user',
        content: `${PIPELINE_CONTEXT_LLM.CREATE_PAPER_OUTPUT}\n\n${digest}`,
      },
    ]
  },

  toSubStep(entries: StepOutputEntry[]): AssistantSubStep | null {
    const digest = getCreatePaperDigest(entries)
    if (!digest) return null
    return {
      type: 'CreatePaperStep',
      title: CREATE_PAPER_STEP_TITLE,
      content: digest,
    }
  },

  toStepCapture(entries: StepOutputEntry[]): StepRunCapture | null {
    const last = entries[entries.length - 1]?.data as CreatePaperStepData | undefined
    const digest = getCreatePaperDigest(entries)
    if (!digest || !last?.outputPath) return null
    return {
      stepType: 'CreatePaperStep',
      title: CREATE_PAPER_STEP_TITLE,
      content: digest,
      outputPaths: [last.outputPath],
    }
  },

  hasOutput(entries: StepOutputEntry[]): boolean {
    return entries.some((e) => {
      const data = e.data as CreatePaperStepData
      return Boolean(data.outputPath?.trim() || data.text?.trim())
    })
  },
}
