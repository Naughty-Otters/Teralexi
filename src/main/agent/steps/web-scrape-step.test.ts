import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebScrapeOrchestrator } from './web-scrape-step'
import type { AgentFlowContext, AgentStepContext } from '../context'
import { StepOutputStore } from './step-output-store'
import type { SearchStepData } from './step-io'
import { SEARCH_STEP_ID } from '../constants/step-ids'

vi.mock('@toolSet/web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@toolSet/web')>()
  return {
    ...actual,
    scrapePage: vi.fn(),
  }
})

import { scrapePage } from '@toolSet/web'

function makeCtx(sandboxRoot: string): AgentStepContext {
  const outputStore = new StepOutputStore()
  outputStore.push({
    stepId: SEARCH_STEP_ID,
    instanceKey: 'search:1',
    timestamp: new Date().toISOString(),
    data: {
      topic: 'otters',
      items: [
        {
          address: 'https://example.com/otters',
          brief: 'All about otters',
          title: 'Otters',
        },
      ],
      abstraction: 'Otters are great.',
    } satisfies SearchStepData,
  })

  const childContexts: AgentStepContext[] = []

  const flowContext = {
    outputStore,
    stepOutputs: {},
    getLatestUserMessageContent: () => 'otters',
    sandbox: {
      getRoot: () => sandboxRoot,
    },
    appendAssistantTurn: vi.fn(),
    createStepContext: vi.fn(
      (_stepId: string, title: string, flowStepConfig?: unknown) => {
        const child = {
          flowContext,
          flowStepConfig,
          title,
          opts: {},
          config: {},
          currentMessages: [],
          beginStep: vi.fn(),
          emitStepProgress: vi.fn(),
          recordStepOutput: vi.fn(),
          hitlAwaitingApproval: false,
          hitlAwaitingFormData: false,
        } as unknown as AgentStepContext
        childContexts.push(child)
        return child
      },
    ),
  } as unknown as AgentFlowContext

  return {
    flowContext,
    flowStepConfig: { webScrape: {} },
    title: 'Web Scrape',
    opts: {},
    config: {},
    currentMessages: [],
    beginStep: vi.fn(),
    emitStepProgress: vi.fn(),
    recordStepOutput: vi.fn(),
    createStepContext: flowContext.createStepContext,
    appendAssistantTurn: flowContext.appendAssistantTurn,
    hitlAwaitingApproval: false,
    hitlAwaitingFormData: false,
  } as unknown as AgentStepContext
}

describe('WebScrapeOrchestrator', () => {
  beforeEach(() => {
    vi.mocked(scrapePage).mockReset()
  })

  it('scrapes search hits and writes markdown under webScrape/output/', async () => {
    vi.mocked(scrapePage).mockResolvedValue({
      url: 'https://example.com/otters',
      title: 'Otters',
      html: '<html><body><p>River otters</p></body></html>',
      truncated: false,
      fetchMode: 'cheerio',
    })

    const sandboxRoot = await mkdtemp(join(tmpdir(), 'teralexi-scrape-'))
    const ctx = makeCtx(sandboxRoot)
    const step = new WebScrapeOrchestrator(ctx)
    await step.execute()

    const expectedPath = join(
      sandboxRoot,
      'webScrape',
      'output',
      '001-example.com-otters.md',
    )
    const written = await readFile(expectedPath, 'utf8')
    expect(written).toContain('River otters')
    expect(scrapePage).toHaveBeenCalledWith('https://example.com/otters', undefined)
    expect(ctx.flowContext.appendAssistantTurn).toHaveBeenCalled()
  })

  it('continues when scrapePage fails for a URL', async () => {
    vi.mocked(scrapePage).mockRejectedValue(new Error('timeout'))

    const sandboxRoot = await mkdtemp(join(tmpdir(), 'teralexi-scrape-fail-'))
    const ctx = makeCtx(sandboxRoot)
    const step = new WebScrapeOrchestrator(ctx)
    await expect(step.execute()).resolves.toBeUndefined()

    expect(scrapePage).toHaveBeenCalled()
    expect(ctx.flowContext.appendAssistantTurn).toHaveBeenCalledWith(
      expect.stringContaining('No pages scraped'),
    )
  })
})
