import { readFile } from 'node:fs/promises'
import type { AgentFlowContext } from '../../context'
import { SEARCH_STEP_ID, WEB_SCRAPE_STEP_ID } from '../../constants/step-ids'
import type { SearchStepData, WebScrapeStepData } from '../step-io'
import type { SearchResultItem } from '../search-config'
import { scrapeSearchItemToMarkdownFile } from '../web-scrape/scrape-item'
import type { ResolvedCreatePaperConfig } from '../create-paper-config'
import { normalizeSourceUrl } from './normalize-url'
import { isSubstantiveDownloadedContent } from './source-content'

export type PaperSourceDocument = {
  address: string
  title?: string
  brief?: string
  outputPath: string
  markdown: string
  fromPriorScrape: boolean
}

export type CollectedPaperInputs = {
  topic: string
  /** SERP synthesis from the search step — topic context only, not report evidence. */
  abstraction: string
  searchItems: SearchResultItem[]
  /** Sources with downloaded/scraped page bodies used to draft the report. */
  sources: PaperSourceDocument[]
  /** Search hits that had no usable downloaded content (excluded from the report prompt). */
  skippedWithoutDownload: number
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function latestSearchData(ctx: AgentFlowContext): SearchStepData | undefined {
  return ctx.outputStore.latest<SearchStepData>(SEARCH_STEP_ID)
}

type ScrapedPageRecord = {
  address: string
  title?: string
  brief?: string
  outputPath: string
  markdown?: string
}

function scrapedPagesFromStore(ctx: AgentFlowContext): ScrapedPageRecord[] {
  const byUrl = new Map<string, ScrapedPageRecord>()

  const upsert = (page: ScrapedPageRecord) => {
    const address = page.address.trim()
    const outputPath = page.outputPath.trim()
    if (!address || !outputPath) return
    const key = normalizeSourceUrl(address)
    const existing = byUrl.get(key)
    if (existing) {
      byUrl.set(key, {
        ...existing,
        title: existing.title ?? page.title,
        brief: existing.brief ?? page.brief,
        markdown: existing.markdown?.trim() ? existing.markdown : page.markdown,
      })
      return
    }
    byUrl.set(key, {
      address,
      title: page.title,
      brief: page.brief,
      outputPath,
      markdown: page.markdown,
    })
  }

  for (const entry of ctx.outputStore.all(WEB_SCRAPE_STEP_ID)) {
    const data = entry.data as WebScrapeStepData & { markdown?: string }
    if (data.pages?.length) {
      for (const page of data.pages) {
        const withMarkdown = page as typeof page & { markdown?: string }
        upsert({
          address: page.address,
          title: page.title,
          brief: page.brief,
          outputPath: page.outputPath,
          markdown: withMarkdown.markdown,
        })
      }
      continue
    }
    if (data.outputPath?.trim() && data.address?.trim()) {
      upsert({
        address: data.address.trim(),
        title: data.title,
        brief: data.brief,
        outputPath: data.outputPath.trim(),
        markdown: data.markdown,
      })
    }
  }

  return [...byUrl.values()]
}

async function readMarkdownFile(
  path: string,
  maxChars: number,
): Promise<string> {
  try {
    const raw = await readFile(path, 'utf8')
    return truncate(raw, maxChars)
  } catch {
    return ''
  }
}

async function resolveSourceMarkdown(
  page: ScrapedPageRecord,
  maxChars: number,
): Promise<string> {
  if (page.markdown?.trim()) {
    return truncate(page.markdown, maxChars)
  }
  return readMarkdownFile(page.outputPath, maxChars)
}

async function buildSourceFromScraped(
  page: ScrapedPageRecord,
  item: SearchResultItem | undefined,
  maxChars: number,
): Promise<PaperSourceDocument | null> {
  const markdown = await resolveSourceMarkdown(page, maxChars)
  if (!isSubstantiveDownloadedContent(markdown)) return null

  const url = page.address.trim()
  return {
    address: url,
    title: page.title ?? item?.title,
    brief: page.brief ?? item?.brief,
    outputPath: page.outputPath,
    markdown,
    fromPriorScrape: true,
  }
}

export async function collectPaperInputs(
  ctx: AgentFlowContext,
  config: ResolvedCreatePaperConfig,
): Promise<CollectedPaperInputs> {
  const search = latestSearchData(ctx)
  const topic = config.topic.trim() || search?.topic?.trim() || ''
  const abstraction = search?.abstraction?.trim() || ''
  const searchItems: SearchResultItem[] = (search?.items ?? []).map((item) => ({
    address: item.address,
    brief: item.brief,
    title: item.title,
  }))

  const scraped = scrapedPagesFromStore(ctx)
  const searchByUrl = new Map<string, SearchResultItem>()
  for (const item of searchItems) {
    const url = item.address.trim()
    if (!url) continue
    searchByUrl.set(normalizeSourceUrl(url), item)
  }

  const scrapedByUrl = new Map<string, ScrapedPageRecord>()
  for (const page of scraped) {
    scrapedByUrl.set(normalizeSourceUrl(page.address), page)
  }

  const sources: PaperSourceDocument[] = []
  const usedUrls = new Set<string>()
  const sandboxRoot = ctx.sandbox.getRoot()
  let seq = 0

  // 1. Prefer all prior web-scrape downloads (pipeline foreach step).
  for (const page of scraped) {
    const key = normalizeSourceUrl(page.address)
    if (usedUrls.has(key)) continue
    const item = searchByUrl.get(key)
    const doc = await buildSourceFromScraped(
      page,
      item,
      config.maxCharsPerSource,
    )
    if (!doc) continue
    usedUrls.add(key)
    sources.push(doc)
  }

  // 2. Fetch any search hits not yet downloaded (e.g. scrape skipped or failed item).
  for (const item of searchItems) {
    const url = item.address.trim()
    if (!url) continue
    const key = normalizeSourceUrl(url)
    if (usedUrls.has(key)) continue
    if (!sandboxRoot) continue

    const fetched = await scrapeSearchItemToMarkdownFile({
      item,
      index: seq,
      sandboxRoot,
      maxChars: config.maxCharsPerSource,
    })
    seq += 1
    if (!fetched) continue

    const markdown = truncate(fetched.markdown, config.maxCharsPerSource)
    if (!isSubstantiveDownloadedContent(markdown)) continue

    usedUrls.add(key)
    sources.push({
      address: url,
      title: fetched.title ?? item.title,
      brief: item.brief,
      outputPath: fetched.outputPath,
      markdown,
      fromPriorScrape: false,
    })
  }

  const skippedWithoutDownload = searchItems.filter((item) => {
    const url = item.address.trim()
    if (!url) return false
    return !usedUrls.has(normalizeSourceUrl(url))
  }).length

  return {
    topic,
    abstraction,
    searchItems,
    sources,
    skippedWithoutDownload,
  }
}
