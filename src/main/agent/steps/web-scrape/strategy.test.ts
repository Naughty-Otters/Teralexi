import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AgentFlowContext } from '../../context'
import { SEARCH_STEP_ID } from '../../constants/step-ids'
import type { SearchStepData } from '../step-io'
import { createWebScrapeStrategy } from './strategy'

vi.mock('./scrape-item', () => ({
  scrapeSearchItemToMarkdownFile: vi.fn(),
}))

import { scrapeSearchItemToMarkdownFile } from './scrape-item'

function makeFlowWithSearchHits(items: SearchStepData['items']) {
  const flow = new AgentFlowContext(
    {
      provider: 'ollama',
      model: 'test',
      systemPrompt: '',
      messages: [],
      userId: 'u1',
      onChunk: vi.fn(),
    },
    {},
  )

  flow.outputStore.push({
    stepId: SEARCH_STEP_ID,
    instanceKey: 'search:1',
    timestamp: new Date().toISOString(),
    data: {
      topic: 'otters',
      items,
      abstraction: 'summary',
    } satisfies SearchStepData,
  })

  return flow
}

describe('createWebScrapeStrategy', () => {
  beforeEach(() => {
    vi.mocked(scrapeSearchItemToMarkdownFile).mockReset()
  })

  it('shouldRun is false when there are no search hits', () => {
    const flow = makeFlowWithSearchHits([])
    const strategy = createWebScrapeStrategy({})
    const ctx = flow.createStepContext('foreachItem', 'Scrape') as never
    expect(strategy.shouldRun(ctx)).toBe(false)
  })

  it('scrapes search hits and records aggregate output', async () => {
    vi.mocked(scrapeSearchItemToMarkdownFile).mockResolvedValue({
      url: 'https://example.com/otters',
      title: 'Otters',
      outputPath: '/sandbox/webScrape/output/page-0.md',
      markdown: '# Otters',
    })

    const flow = makeFlowWithSearchHits([
      { address: 'https://example.com/otters', brief: 'All about otters' },
    ])
    flow.sandbox.attach({
      layout: { root: '/sandbox' },
      buildInstructionBlock: () => '',
      buildSandboxStructureBlock: () => '',
      buildWorkspaceStructureBlock: () => '',
      ensureToolLoopStepOutputDirs: vi.fn(),
    } as never)

    const strategy = createWebScrapeStrategy({ maxItems: 1 })
    const batchCtx = flow.createStepContext('foreachItem', 'Scrape')
    batchCtx.recordStepOutput = vi.fn()
    batchCtx.appendAssistantTurn = vi.fn()
    batchCtx.beginStep = vi.fn()
    batchCtx.emitStepProgress = vi.fn()

    expect(strategy.shouldRun(batchCtx)).toBe(true)
    await strategy.onBatchStart?.(batchCtx)
    const { items } = strategy.resolveItems(batchCtx)
    const stepCtx = flow.createStepContext('webScrape', 'Scrape item')
    stepCtx.beginStep = vi.fn()
    stepCtx.emitStepProgress = vi.fn()
    stepCtx.recordStepOutput = vi.fn()

    await strategy.runItem(batchCtx, items[0]!, 0, stepCtx)
    await strategy.onBatchEnd?.(batchCtx)

    expect(scrapeSearchItemToMarkdownFile).toHaveBeenCalled()
    expect(batchCtx.recordStepOutput).toHaveBeenCalled()
    expect(batchCtx.appendAssistantTurn).toHaveBeenCalled()
  })

  it('skips scrape when sandbox root is missing', async () => {
    const flow = makeFlowWithSearchHits([
      { address: 'https://example.com/otters', brief: 'All about otters' },
    ])
    const strategy = createWebScrapeStrategy({})
    const batchCtx = flow.createStepContext('foreachItem', 'Scrape')
    const { items } = strategy.resolveItems(batchCtx)
    const stepCtx = flow.createStepContext('webScrape', 'Scrape item')
    stepCtx.emitStepProgress = vi.fn()

    const result = await strategy.runItem(batchCtx, items[0]!, 0, stepCtx)
    expect(result.paused).toBe(false)
    expect(stepCtx.emitStepProgress).toHaveBeenCalledWith(
      expect.stringContaining('no active sandbox'),
    )
  })

  it('continues when scrape throws and batch end recording fails', async () => {
    vi.mocked(scrapeSearchItemToMarkdownFile).mockRejectedValue(new Error('network'))

    const flow = makeFlowWithSearchHits([
      { address: 'https://example.com/otters', brief: 'All about otters' },
    ])
    flow.sandbox.attach({
      layout: { root: '/sandbox' },
      buildInstructionBlock: () => '',
      buildSandboxStructureBlock: () => '',
      buildWorkspaceStructureBlock: () => '',
      ensureToolLoopStepOutputDirs: vi.fn(),
    } as never)

    const strategy = createWebScrapeStrategy({})
    const batchCtx = flow.createStepContext('foreachItem', 'Scrape')
    batchCtx.recordStepOutput = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('record failed')
      })
      .mockImplementation(() => undefined)
    batchCtx.appendAssistantTurn = vi.fn()
    batchCtx.beginStep = vi.fn()

    const { items } = strategy.resolveItems(batchCtx)
    const stepCtx = flow.createStepContext('webScrape', 'Scrape item')
    stepCtx.beginStep = vi.fn()
    stepCtx.emitStepProgress = vi.fn()
    stepCtx.recordStepOutput = vi.fn()

    await strategy.runItem(batchCtx, items[0]!, 0, stepCtx)
    await strategy.onBatchEnd?.(batchCtx)

    expect(batchCtx.appendAssistantTurn).toHaveBeenCalled()
  })

  it('skips items when scrape returns null', async () => {
    vi.mocked(scrapeSearchItemToMarkdownFile).mockResolvedValue(null)

    const flow = makeFlowWithSearchHits([
      { address: 'https://example.com/otters', brief: 'All about otters' },
    ])
    flow.sandbox.attach({
      layout: { root: '/sandbox' },
      buildInstructionBlock: () => '',
      buildSandboxStructureBlock: () => '',
      buildWorkspaceStructureBlock: () => '',
      ensureToolLoopStepOutputDirs: vi.fn(),
    } as never)

    const strategy = createWebScrapeStrategy({})
    const batchCtx = flow.createStepContext('foreachItem', 'Scrape')
    const { items } = strategy.resolveItems(batchCtx)
    const stepCtx = flow.createStepContext('webScrape', 'Scrape item')
    stepCtx.beginStep = vi.fn()
    stepCtx.emitStepProgress = vi.fn()
    stepCtx.recordStepOutput = vi.fn()
    stepCtx.hitlAwaitingApproval = false
    stepCtx.hitlAwaitingFormData = false

    await strategy.runItem(batchCtx, items[0]!, 0, stepCtx)

    expect(stepCtx.emitStepProgress).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch'),
    )
  })
})
