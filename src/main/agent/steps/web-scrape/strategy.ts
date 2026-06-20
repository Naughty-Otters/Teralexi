import type { AgentFlowContext, AgentStepContext } from '../../context'
import {
  WEB_SCRAPE_STEP_ID,
  WEB_SCRAPE_STEP_TITLE,
} from '../../constants/step-ids'
import type { SearchResultItem } from '../search-config'
import {
  resolveWebScrapeConfig,
  type WebScrapeConfig,
} from '../web-scrape-config'
import type { ForEachItemStrategy } from '../foreach-item/types'
import { searchResultItemsFromFlow } from './search-items'
import {
  formatWebScrapeDigest,
  formatWebScrapeProgress,
} from './format-scrape'
import { createLogger } from '@main/logger'
import { scrapeSearchItemToMarkdownFile, type ScrapedPageRecord } from './scrape-item'

const log = createLogger('agent.steps.web-scrape.strategy')

const scrapedPagesByFlow = new WeakMap<AgentFlowContext, ScrapedPageRecord[]>()

function sliceSearchItems(
  items: SearchResultItem[],
  config: ReturnType<typeof resolveWebScrapeConfig>,
): SearchResultItem[] {
  const start = config.startIndex
  const sliced = items.slice(start)
  if (config.maxItems != null && config.maxItems >= 0) {
    return sliced.slice(0, config.maxItems)
  }
  return sliced
}

export function createWebScrapeStrategy(
  config: WebScrapeConfig | undefined,
): ForEachItemStrategy {
  const resolved = resolveWebScrapeConfig(config)

  return {
    shouldRun(ctx) {
      return sliceSearchItems(searchResultItemsFromFlow(ctx.flowContext), resolved).length > 0
    },

    async onBatchStart(ctx) {
      scrapedPagesByFlow.set(ctx.flowContext, [])
      const items = sliceSearchItems(
        searchResultItemsFromFlow(ctx.flowContext),
        resolved,
      )
      try {
        ctx.beginStep(
          WEB_SCRAPE_STEP_ID,
          ctx.flowStepConfig?.title?.trim() || WEB_SCRAPE_STEP_TITLE,
          { itemCount: items.length, startIndex: resolved.startIndex },
          undefined,
          `Scrape ${items.length} page(s) from search results`,
        )
      } catch (err) {
        log.warn('Web scrape batch start failed; continuing with empty scrape output', {
          err,
        })
      }
    },

    resolveItems(ctx) {
      const items = sliceSearchItems(
        searchResultItemsFromFlow(ctx.flowContext),
        resolved,
      )
      return { items, startIndex: 0 }
    },

    itemTitle(_ctx, item, index) {
      const hit = item as SearchResultItem
      return hit.title?.trim() || hit.address?.trim() || `Page ${index + 1}`
    },

    async runItem(flowCtx, item, index, stepCtx) {
      const hit = item as SearchResultItem
      const sandboxRoot = flowCtx.flowContext.sandbox.getRoot()
      if (!sandboxRoot) {
        stepCtx.emitStepProgress('\n⚠ Web scrape skipped: no active sandbox.\n')
        return { paused: false }
      }

      try {
        stepCtx.beginStep(
          WEB_SCRAPE_STEP_ID,
          stepCtx.title,
          { url: hit.address, index },
        )

        stepCtx.emitStepProgress(`\n🌐 Fetching ${hit.address}\n`)

        const record = await scrapeSearchItemToMarkdownFile({
          item: hit,
          index: resolved.startIndex + index,
          sandboxRoot,
          maxChars: resolved.maxChars,
        })

        if (!record) {
          log.warn('Web scrape failed for URL; skipping item', {
            url: hit.address,
          })
          stepCtx.emitStepProgress(
            `\n⚠ Failed to fetch ${hit.address}; skipping.\n`,
          )
          return {
            paused:
              stepCtx.hitlAwaitingApproval || stepCtx.hitlAwaitingFormData,
          }
        }

        const pages = scrapedPagesByFlow.get(flowCtx.flowContext) ?? []
        pages.push(record)
        scrapedPagesByFlow.set(flowCtx.flowContext, pages)

        stepCtx.emitStepProgress(formatWebScrapeProgress(record))
        stepCtx.recordStepOutput(
          WEB_SCRAPE_STEP_ID,
          stepCtx.title,
          {
            address: record.address,
            title: record.title,
            brief: record.brief,
            outputPath: record.outputPath,
            markdown: record.markdown,
          },
          formatWebScrapeProgress(record).trim(),
          { url: hit.address, outputPath: record.outputPath },
        )
      } catch (err) {
        log.warn('Web scrape item failed; skipping', { url: hit.address, err })
        stepCtx.emitStepProgress(
          `\n⚠ Failed to fetch ${hit.address}; skipping.\n`,
        )
      }

      return {
        paused:
          stepCtx.hitlAwaitingApproval || stepCtx.hitlAwaitingFormData,
      }
    },

    async onBatchEnd(ctx) {
      const pages = scrapedPagesByFlow.get(ctx.flowContext) ?? []
      scrapedPagesByFlow.delete(ctx.flowContext)
      const digest = formatWebScrapeDigest(pages)

      try {
        ctx.recordStepOutput(
          WEB_SCRAPE_STEP_ID,
          ctx.flowStepConfig?.title?.trim() || WEB_SCRAPE_STEP_TITLE,
          { pages },
          digest,
          { aggregate: true },
          undefined,
          pages.length > 0
            ? `Scraped ${pages.length} page(s) to sandbox/${WEB_SCRAPE_STEP_ID}/output/`
            : 'No pages could be scraped.',
        )
        ctx.appendAssistantTurn(digest)
      } catch (err) {
        log.warn('Web scrape batch end failed; continuing with empty aggregate', {
          err,
        })
        const emptyDigest = formatWebScrapeDigest([])
        try {
          ctx.recordStepOutput(
            WEB_SCRAPE_STEP_ID,
            ctx.flowStepConfig?.title?.trim() || WEB_SCRAPE_STEP_TITLE,
            { pages: [] },
            emptyDigest,
            { aggregate: true },
          )
          ctx.appendAssistantTurn(emptyDigest)
        } catch {
          /* Do not fail the pipeline. */
        }
      }
    },
  }
}
