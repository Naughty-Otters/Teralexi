import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AgentFlowContext } from '../../context'
import { SEARCH_STEP_ID, WEB_SCRAPE_STEP_ID } from '../../constants/step-ids'
import { StepOutputStore } from '../step-output-store'
import { collectPaperInputs } from './collect-sources'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

vi.mock('../web-scrape/scrape-item', () => ({
  scrapeSearchItemToMarkdownFile: vi.fn(),
}))

import { scrapeSearchItemToMarkdownFile } from '../web-scrape/scrape-item'

function mockFlow(): AgentFlowContext {
  const store = new StepOutputStore()
  store.push({
    stepId: SEARCH_STEP_ID,
    instanceKey: 'search:1',
    data: {
      topic: 'river otters',
      abstraction: 'Otters live in rivers.',
      items: [
        {
          address: 'https://example.com/a',
          brief: 'About otters',
          title: 'Otters',
        },
      ],
    },
    timestamp: '2026-01-01T00:00:00Z',
  })
  store.push({
    stepId: WEB_SCRAPE_STEP_ID,
    instanceKey: 'webScrape:agg',
    data: {
      pages: [
        {
          address: 'https://example.com/a',
          title: 'Otters',
          outputPath: '/tmp/sandbox/webScrape/output/001.md',
        },
      ],
    },
    timestamp: '2026-01-01T00:00:01Z',
  })

  return {
    outputStore: store,
    stepOutputs: {},
    sandbox: {
      getRoot: () => '/tmp/sandbox',
    },
  } as unknown as AgentFlowContext
}

describe('collectPaperInputs', () => {
  beforeEach(() => {
    vi.mocked(readFile).mockReset()
    vi.mocked(scrapeSearchItemToMarkdownFile).mockReset()
  })

  it('reads scraped markdown from prior webScrape output', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '# Otter facts\n\nThey swim in rivers and forage for fish across temperate regions.',
    )

    const inputs = await collectPaperInputs(mockFlow(), {
      topic: 'river otters',
      outputFileName: 'research-report.pdf',
      maxCharsPerSource: 5000,
    })

    expect(inputs.topic).toBe('river otters')
    expect(inputs.abstraction).toContain('Otters live')
    expect(inputs.sources).toHaveLength(1)
    expect(inputs.sources[0]?.fromPriorScrape).toBe(true)
    expect(inputs.sources[0]?.markdown).toContain('Otter facts')
    expect(scrapeSearchItemToMarkdownFile).not.toHaveBeenCalled()
  })

  it('uses inline markdown from webScrape step data without reading the file', async () => {
    const flow = mockFlow()
    flow.outputStore.clear()
    flow.outputStore.push({
      stepId: SEARCH_STEP_ID,
      instanceKey: 'search:1',
      data: {
        topic: 'river otters',
        abstraction: 'Otters live in rivers.',
        items: [
          {
            address: 'https://example.com/a',
            brief: 'About otters',
            title: 'Otters',
          },
        ],
      },
      timestamp: '2026-01-01T00:00:00Z',
    })
    flow.outputStore.push({
      stepId: WEB_SCRAPE_STEP_ID,
      instanceKey: 'webScrape:1',
      data: {
        address: 'https://example.com/a',
        title: 'Otters',
        outputPath: '/tmp/sandbox/webScrape/output/001.md',
        markdown:
          '# Inline otter data\n\nPopulation estimates exceed 100,000 animals in major river systems.',
      },
      timestamp: '2026-01-01T00:00:01Z',
    })

    const inputs = await collectPaperInputs(flow, {
      topic: 'river otters',
      outputFileName: 'research-report.pdf',
      maxCharsPerSource: 5000,
    })

    expect(inputs.sources[0]?.markdown).toContain('Population estimates')
    expect(readFile).not.toHaveBeenCalled()
  })

  it('matches scraped pages when search URL differs only by trailing slash', async () => {
    const flow = mockFlow()
    flow.outputStore.clear()
    flow.outputStore.push({
      stepId: SEARCH_STEP_ID,
      instanceKey: 'search:1',
      data: {
        topic: 'topic',
        abstraction: 'abs',
        items: [{ address: 'https://example.com/a/', brief: 'b', title: 'A' }],
      },
      timestamp: '2026-01-01T00:00:00Z',
    })
    flow.outputStore.push({
      stepId: WEB_SCRAPE_STEP_ID,
      instanceKey: 'webScrape:1',
      data: {
        address: 'https://example.com/a',
        title: 'A',
        outputPath: '/tmp/sandbox/webScrape/output/001.md',
        markdown:
          'matched content with sufficient length to be used as downloaded evidence in the report.',
      },
      timestamp: '2026-01-01T00:00:01Z',
    })

    const inputs = await collectPaperInputs(flow, {
      topic: 'topic',
      outputFileName: 'research-report.pdf',
      maxCharsPerSource: 5000,
    })

    expect(inputs.sources).toHaveLength(1)
    expect(inputs.sources[0]?.markdown).toContain('matched content')
    expect(scrapeSearchItemToMarkdownFile).not.toHaveBeenCalled()
  })

  it('does not include search-snippet-only hits when scrape failed', async () => {
    const flow = mockFlow()
    flow.outputStore.clear()
    flow.outputStore.push({
      stepId: SEARCH_STEP_ID,
      instanceKey: 'search:1',
      data: {
        topic: 'topic',
        abstraction: 'SERP summary text only.',
        items: [{ address: 'https://example.com/missing', brief: 'snippet only' }],
      },
      timestamp: '2026-01-01T00:00:00Z',
    })

    vi.mocked(scrapeSearchItemToMarkdownFile).mockResolvedValue(null)

    const inputs = await collectPaperInputs(flow, {
      topic: 'topic',
      outputFileName: 'research-report.pdf',
      maxCharsPerSource: 5000,
    })

    expect(inputs.sources).toHaveLength(0)
    expect(inputs.skippedWithoutDownload).toBe(1)
    expect(scrapeSearchItemToMarkdownFile).toHaveBeenCalled()
  })

  it('fetches missing URLs when scrape output is absent', async () => {
    const flow = mockFlow()
    flow.outputStore.clear()
    flow.outputStore.push({
      stepId: SEARCH_STEP_ID,
      instanceKey: 'search:1',
      data: {
        topic: 'topic',
        abstraction: 'abs',
        items: [{ address: 'https://example.com/new', brief: 'b' }],
      },
      timestamp: '2026-01-01T00:00:00Z',
    })

    vi.mocked(scrapeSearchItemToMarkdownFile).mockResolvedValue({
      address: 'https://example.com/new',
      outputPath: '/tmp/sandbox/webScrape/output/000.md',
      markdown:
        'fresh content with enough length to qualify as a downloaded research source body.',
    })

    const inputs = await collectPaperInputs(flow, {
      topic: 'topic',
      outputFileName: 'research-report.pdf',
      maxCharsPerSource: 5000,
    })

    expect(inputs.sources).toHaveLength(1)
    expect(inputs.sources[0]?.fromPriorScrape).toBe(false)
    expect(scrapeSearchItemToMarkdownFile).toHaveBeenCalled()
  })

  it('excludes sources whose downloaded body is too short', async () => {
    const flow = mockFlow()
    flow.outputStore.clear()
    flow.outputStore.push({
      stepId: WEB_SCRAPE_STEP_ID,
      instanceKey: 'webScrape:1',
      data: {
        address: 'https://example.com/thin',
        title: 'Thin',
        outputPath: '/tmp/thin.md',
        markdown: 'Too short.',
      },
      timestamp: '2026-01-01T00:00:00Z',
    })

    const inputs = await collectPaperInputs(flow, {
      topic: 'topic',
      outputFileName: 'research-report.pdf',
      maxCharsPerSource: 5000,
    })

    expect(inputs.sources).toHaveLength(0)
  })

  it('excludes legacy snippet-placeholder bodies from prior scrape', async () => {
    const flow = mockFlow()
    flow.outputStore.clear()
    flow.outputStore.push({
      stepId: SEARCH_STEP_ID,
      instanceKey: 'search:1',
      data: {
        topic: 'topic',
        abstraction: 'SERP',
        items: [
          {
            address: 'https://example.com/a',
            brief: 'Should not appear in report body',
            title: 'A',
          },
        ],
      },
      timestamp: '2026-01-01T00:00:00Z',
    })
    flow.outputStore.push({
      stepId: WEB_SCRAPE_STEP_ID,
      instanceKey: 'webScrape:1',
      data: {
        address: 'https://example.com/a',
        title: 'A',
        outputPath: '/tmp/a.md',
        markdown:
          '_Scraped page content unavailable. Search snippet only:_\n\nShort SERP text that must not count as evidence.',
      },
      timestamp: '2026-01-01T00:00:01Z',
    })

    const inputs = await collectPaperInputs(flow, {
      topic: 'topic',
      outputFileName: 'research-report.pdf',
      maxCharsPerSource: 5000,
    })

    expect(inputs.sources).toHaveLength(0)
    expect(inputs.skippedWithoutDownload).toBe(1)
  })

  it('includes scraped pages even when they are not in search items', async () => {
    const flow = mockFlow()
    flow.outputStore.clear()
    flow.outputStore.push({
      stepId: WEB_SCRAPE_STEP_ID,
      instanceKey: 'webScrape:only',
      data: {
        pages: [
          {
            address: 'https://example.com/scrape-only',
            title: 'Scrape only',
            outputPath: '/tmp/only.md',
            markdown:
              'Downloaded page content that was scraped without a matching search row in the store.',
          },
        ],
      },
      timestamp: '2026-01-01T00:00:00Z',
    })

    const inputs = await collectPaperInputs(flow, {
      topic: 'orphan scrape',
      outputFileName: 'research-report.pdf',
      maxCharsPerSource: 5000,
    })

    expect(inputs.sources).toHaveLength(1)
    expect(inputs.sources[0]?.address).toBe('https://example.com/scrape-only')
    expect(inputs.sources[0]?.markdown).not.toContain('Search snippet only')
    expect(scrapeSearchItemToMarkdownFile).not.toHaveBeenCalled()
  })

  it('never puts search brief into source markdown when file content exists', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '# Full article\n\nDetailed findings from the downloaded page with enough length for the report.',
    )

    const inputs = await collectPaperInputs(mockFlow(), {
      topic: 'river otters',
      outputFileName: 'research-report.pdf',
      maxCharsPerSource: 5000,
    })

    expect(inputs.sources[0]?.markdown).toContain('Full article')
    expect(inputs.sources[0]?.markdown).not.toContain('About otters')
  })
})
