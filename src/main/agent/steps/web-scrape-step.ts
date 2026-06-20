import { createLogger, instrumentInstanceMethods } from '@main/logger'
import type { AgentStepContext } from '../context'
import type { StepExpressionDefinition, StepRunContext } from '../flow/step-hook'
import { PIPELINE_CONTEXT_LLM } from '../constants'
import {
  WEB_SCRAPE_STEP_ID,
  WEB_SCRAPE_STEP_TITLE,
} from '../constants/step-ids'
import { AgentStep } from './agent-step'
import type { StepOutputEntry, WebScrapeStepData } from './step-io'
import type { AgentMessage, AssistantSubStep, StepRunCapture } from '../types'
import { runForEachItemBatch } from './foreach-item/batch-runner'
import { searchResultItemsFromFlow } from './web-scrape/search-items'
import { createWebScrapeStrategy } from './web-scrape/strategy'
import {
  resolveWebScrapeConfig,
  webScrapeConfigFromFlowConfig,
} from './web-scrape-config'
import { formatWebScrapeDigest } from './web-scrape/format-scrape'

const log = createLogger('agent.steps.web-scrape')

export class WebScrapeOrchestrator extends AgentStep {
  constructor(ctx: AgentStepContext) {
    super(ctx)
    instrumentInstanceMethods(this, log)
  }

  shouldRun(): boolean {
    const config = resolveWebScrapeConfig(
      webScrapeConfigFromFlowConfig(this.ctx.flowStepConfig),
    )
    const items = searchResultItemsFromFlow(this.ctx.flowContext)
    const start = config.startIndex
    const slice = items.slice(start)
    const capped =
      config.maxItems != null && config.maxItems >= 0
        ? slice.slice(0, config.maxItems)
        : slice
    return capped.length > 0
  }

  async execute(): Promise<void> {
    const config = webScrapeConfigFromFlowConfig(this.ctx.flowStepConfig)
    const strategy = createWebScrapeStrategy(config)
    await runForEachItemBatch(this.ctx, strategy)
  }
}

function aggregateWebScrapeData(
  entries: StepOutputEntry[],
): WebScrapeStepData | undefined {
  const aggregate = entries.find(
    (entry) => (entry.data as WebScrapeStepData).pages?.length != null,
  )
  if (aggregate) {
    return aggregate.data as WebScrapeStepData
  }

  const pages = entries
    .map((entry) => entry.data as WebScrapeStepData & { outputPath?: string })
    .filter((data) => data.outputPath && data.address)
    .map((data) => ({
      address: data.address!,
      title: data.title,
      brief: data.brief,
      outputPath: data.outputPath!,
    }))

  if (pages.length === 0) return undefined
  return { pages }
}

function getWebScrapeDigest(entries: StepOutputEntry[]): string {
  const data = aggregateWebScrapeData(entries)
  if (!data?.pages?.length) {
    return entries
      .map((entry) => (entry.data as WebScrapeStepData).rendered?.trim())
      .filter(Boolean)
      .join('\n\n')
  }
  return formatWebScrapeDigest(
    data.pages.map((page) => ({
      address: page.address,
      title: page.title,
      brief: page.brief,
      outputPath: page.outputPath,
      markdown: '',
    })),
  )
}

export const webScrapeFlowStepDefinition: StepExpressionDefinition = {
  id: WEB_SCRAPE_STEP_ID,
  title: WEB_SCRAPE_STEP_TITLE,
  mergeStrategy: 'aggregate',

  shouldRun(run: StepRunContext): boolean {
    const config = resolveWebScrapeConfig(
      webScrapeConfigFromFlowConfig(run.config),
    )
    const items = searchResultItemsFromFlow(run.flow)
    const slice = items.slice(config.startIndex)
    const capped =
      config.maxItems != null && config.maxItems >= 0
        ? slice.slice(0, config.maxItems)
        : slice
    return capped.length > 0
  },

  run: async (run: StepRunContext) => {
    const step = new WebScrapeOrchestrator(
      run.flow.createStepContext(
        WEB_SCRAPE_STEP_ID,
        run.config?.title?.trim() || WEB_SCRAPE_STEP_TITLE,
        run.config,
      ),
    )
    if (step.shouldRun()) await step.execute()
  },

  toContextMessages(entries: StepOutputEntry[]): AgentMessage[] {
    const digest = getWebScrapeDigest(entries)
    if (!digest) return []
    return [
      {
        role: 'user',
        content: `${PIPELINE_CONTEXT_LLM.WEB_SCRAPE_OUTPUT}\n\n${digest}`,
      },
    ]
  },

  toSubStep(entries: StepOutputEntry[]): AssistantSubStep | null {
    const digest = getWebScrapeDigest(entries)
    if (!digest) return null
    return {
      type: 'WebScrapeStep',
      title: WEB_SCRAPE_STEP_TITLE,
      content: digest,
    }
  },

  toStepCapture(entries: StepOutputEntry[]): StepRunCapture | null {
    const digest = getWebScrapeDigest(entries)
    const data = aggregateWebScrapeData(entries)
    if (!digest) return null
    return {
      stepType: 'WebScrapeStep',
      title: WEB_SCRAPE_STEP_TITLE,
      content: digest,
      outputPaths: data?.pages?.map((page) => page.outputPath) ?? [],
    }
  },

  hasOutput(entries: StepOutputEntry[]): boolean {
    return entries.some((entry) => {
      const data = entry.data as WebScrapeStepData
      return Boolean(data.pages?.length || data.outputPath || data.rendered?.trim())
    })
  },
}
