import { createLogger, instrumentInstanceMethods } from '@main/logger'
import type { AgentStepContext } from '../context'
import type {
  StepExpressionDefinition,
  StepRunContext,
} from '../flow/step-hook'
import { PIPELINE_CONTEXT_LLM } from '../constants'
import { SEARCH_STEP_ID, SEARCH_STEP_TITLE } from '../constants/step-ids'
import { AgentStep } from './agent-step'
import type { StepOutputEntry, SearchStepData } from './step-io'
import type { AgentMessage, AssistantSubStep, StepRunCapture } from '../types'
import {
  resolveSearchConfig,
  searchConfigFromFlowConfig,
} from './search-config'
import { generateSearchAbstraction } from './search/abstract-results'
import {
  formatSearchItemsProgress,
  formatSearchOutputMarkdown,
} from './search/format-search'
import { runRoutedSearch } from './search/run-routed-search'
import { expandSearchTopics } from './search/expand-search-topic'
import { deduplicateAndCapSearchResults } from './search/deduplicate-results'

const log = createLogger('agent.steps.search')

export class SearchOrchestrator extends AgentStep {
  constructor(ctx: AgentStepContext) {
    super(ctx)
    instrumentInstanceMethods(this, log)
  }

  shouldRun(): boolean {
    const config = resolveSearchConfig(
      searchConfigFromFlowConfig(this.ctx.flowStepConfig),
      this.ctx.agentFlow,
    )
    return Boolean(config.topic.trim())
  }

  async execute(): Promise<void> {
    const flowConfig = this.ctx.flowStepConfig
    const config = resolveSearchConfig(
      searchConfigFromFlowConfig(flowConfig),
      this.ctx.agentFlow,
    )

    if (!config.topic.trim()) {
      throw new Error('Search stage requires a topic or user message.')
    }

    const title = flowConfig?.title?.trim() || SEARCH_STEP_TITLE
    const goal = `Search the web for: ${config.topic}`

    this.ctx.beginStep(SEARCH_STEP_ID, title, undefined, goal)

    try {
      const searchQueries = await expandSearchTopics(this.ctx, config)
      if (searchQueries.length > 1) {
        this.ctx.emitStepProgress(
          `🧭 Running ${searchQueries.length} search angles for: ${config.topic}\n\n`,
        )
      }

      const searchRuns = [] as Awaited<ReturnType<typeof runRoutedSearch>>[]
      for (const [idx, query] of searchQueries.entries()) {
        const result = await runRoutedSearch(config, query)
        const backendLabel =
          result.backend === 'scholar' ? 'Deep research (Scholar)' : 'Web search'
        this.ctx.emitStepProgress(
          `🔎 ${backendLabel} (${idx + 1}/${searchQueries.length}): ${query}\n_${result.routingReason}${result.usedWebFallback ? ' (web fallback)' : ''}_\n\n`,
        )
        searchRuns.push(result)
      }

      const mergedItems = deduplicateAndCapSearchResults(
        searchRuns.flatMap((run) => run.items),
        config.totalResultCap,
      )
      const searchResult = {
        items: mergedItems,
        searchEngine: searchRuns.find((run) => run.searchEngine)?.searchEngine,
        searchUrl: searchRuns.find((run) => run.searchUrl)?.searchUrl,
        error:
          searchRuns
            .map((run) => run.error?.trim())
            .filter(Boolean)
            .join(' | ') || undefined,
      }

      this.ctx.emitStepProgress(formatSearchItemsProgress(searchResult.items))

      if (searchResult.error && searchResult.items.length === 0) {
        this.ctx.emitStepProgress(
          `\n⚠ Search failed: ${searchResult.error}\nContinuing with empty results.\n\n`,
        )
      }

      const abstraction = await generateSearchAbstraction(
        this.ctx,
        config,
        searchResult.items,
      )

      const rendered = formatSearchOutputMarkdown({
        topic: config.topic,
        items: searchResult.items,
        abstraction,
        searchEngine: searchResult.searchEngine,
        searchUrl: searchResult.searchUrl,
        error: searchResult.error,
      })

      const data: SearchStepData = {
        topic: config.topic,
        items: searchResult.items,
        abstraction,
        searchEngine: searchResult.searchEngine,
        searchUrl: searchResult.searchUrl,
        rendered,
        text: rendered,
      }

      this.ctx.recordStepOutput(
        SEARCH_STEP_ID,
        title,
        data,
        rendered,
        undefined,
        goal,
        abstraction.slice(0, 240),
      )
      this.ctx.appendAssistantTurn(rendered)
    } catch (err) {
      log.warn('Search step failed; recording empty output and continuing', {
        topic: config.topic,
        err,
      })
      const rendered = formatSearchOutputMarkdown({
        topic: config.topic,
        items: [],
        abstraction: '',
        error: err instanceof Error ? err.message : String(err),
      })
      const data: SearchStepData = {
        topic: config.topic,
        items: [],
        abstraction: '',
        rendered,
        text: rendered,
      }
      const errText = err instanceof Error ? err.message : String(err)
      this.ctx.emitStepProgress(
        `\n⚠ Search step error: ${errText}\nContinuing with empty results.\n\n`,
      )
      this.ctx.recordStepOutput(
        SEARCH_STEP_ID,
        title,
        data,
        rendered,
        undefined,
        goal,
      )
      this.ctx.appendAssistantTurn(rendered)
    }
  }
}

function getSearchDigest(entries: StepOutputEntry[]): string {
  return entries
    .map((entry) => {
      const data = entry.data as SearchStepData
      return data.rendered?.trim() || data.text?.trim()
    })
    .filter(Boolean)
    .join('\n\n')
}

export const searchFlowStepDefinition: StepExpressionDefinition = {
  id: SEARCH_STEP_ID,
  title: SEARCH_STEP_TITLE,

  shouldRun(run: StepRunContext): boolean {
    const config = resolveSearchConfig(
      searchConfigFromFlowConfig(run.config),
      run.flow,
    )
    return Boolean(config.topic.trim())
  },

  run: async (run: StepRunContext) => {
    const step = new SearchOrchestrator(
      run.flow.createStepContext(
        SEARCH_STEP_ID,
        run.config?.title?.trim() || SEARCH_STEP_TITLE,
        run.config,
      ),
    )
    if (step.shouldRun()) await step.execute()
  },

  toContextMessages(entries: StepOutputEntry[]): AgentMessage[] {
    const digest = getSearchDigest(entries)
    if (!digest) return []
    return [
      {
        role: 'user',
        content: `${PIPELINE_CONTEXT_LLM.SEARCH_OUTPUT}\n\n${digest}`,
      },
    ]
  },

  toSubStep(entries: StepOutputEntry[]): AssistantSubStep | null {
    const digest = getSearchDigest(entries)
    if (!digest) return null
    return {
      type: 'SearchStep',
      title: SEARCH_STEP_TITLE,
      content: digest,
    }
  },

  toStepCapture(entries: StepOutputEntry[]): StepRunCapture | null {
    const digest = getSearchDigest(entries)
    if (!digest) return null
    return {
      stepType: 'SearchStep',
      title: SEARCH_STEP_TITLE,
      content: digest,
      outputPaths: [],
    }
  },

  hasOutput(entries: StepOutputEntry[]): boolean {
    return entries.some((entry) => {
      const data = entry.data as SearchStepData
      return Boolean(
        data.rendered?.trim() ||
        data.text?.trim() ||
        data.abstraction?.trim() ||
        data.items?.length,
      )
    })
  },
}
