import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SearchOrchestrator, searchFlowStepDefinition } from './search-step'
import type { AgentStepContext } from '../context'
import { AgentFlowContext } from '../context'
import { PIPELINE_CONTEXT_LLM } from '../constants'
import { SEARCH_STEP_ID, SEARCH_STEP_TITLE } from '../constants/step-ids'
import type { SearchStepData } from './step-io'

vi.mock('@toolSet/web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@toolSet/web')>()
  return {
    ...actual,
    cascadeWebSearch: vi.fn(),
  }
})

vi.mock('../expr/run-expression-llm', () => ({
  runExpressionLlmText: vi.fn(),
}))

import { cascadeWebSearch } from '@toolSet/web'
import { runExpressionLlmText } from '../expr/run-expression-llm'

function makeCtx(overrides: Partial<AgentStepContext> = {}): AgentStepContext {
  const emitted: string[] = []
  const flowContext = (overrides.flowContext as any) ?? {
    getLatestUserMessageContent: () => 'user topic',
  }
  const agentFlow = (overrides as any).agentFlow ?? flowContext
  return {
    flowContext,
    agentFlow,
    flowStepConfig: { search: { topic: 'otters' } },
    opts: { responseLanguage: undefined },
    config: {
      withResponseLanguageInstruction: (text: string) => text,
    },
    currentMessages: [{ role: 'user', content: 'otters' }],
    beginStep: vi.fn(),
    emitStepProgress: vi.fn((chunk: string) => {
      emitted.push(chunk)
    }),
    recordStepOutput: vi.fn(),
    appendAssistantTurn: vi.fn(),
    ...overrides,
  } as unknown as AgentStepContext
}

describe('SearchOrchestrator', () => {
  beforeEach(() => {
    vi.mocked(cascadeWebSearch).mockReset()
    vi.mocked(runExpressionLlmText).mockReset()
  })

  it('records search items and total abstraction without scraping', async () => {
    vi.mocked(cascadeWebSearch).mockResolvedValue({
      success: true,
      engine: 'duckduckgo',
      searchUrl: 'https://duckduckgo.com/?q=otters',
      resultCount: 1,
      results: [
        {
          title: 'Otter facts',
          url: 'https://example.com/otters',
          snippet: 'Otters live in rivers.',
        },
      ],
      attempts: [],
    })
    vi.mocked(runExpressionLlmText).mockResolvedValue(
      'Otters are playful semiaquatic mammals.',
    )

    const ctx = makeCtx()
    const step = new SearchOrchestrator(ctx)
    await step.execute()

    expect(cascadeWebSearch).toHaveBeenCalledWith('otters', 8, undefined)
    expect(runExpressionLlmText).toHaveBeenCalled()
    expect(ctx.recordStepOutput).toHaveBeenCalledWith(
      'search',
      'Search',
      expect.objectContaining({
        topic: 'otters',
        items: [
          expect.objectContaining({
            address: 'https://example.com/otters',
            brief: 'Otters live in rivers.',
          }),
        ],
        abstraction: 'Otters are playful semiaquatic mammals.',
      }),
      expect.stringContaining('Total abstraction'),
      undefined,
      expect.any(String),
      expect.any(String),
    )
  })

  it('records empty output when cascadeWebSearch throws', async () => {
    vi.mocked(cascadeWebSearch).mockRejectedValue(new Error('network down'))

    const ctx = makeCtx()
    const step = new SearchOrchestrator(ctx)
    await expect(step.execute()).resolves.toBeUndefined()

    expect(ctx.recordStepOutput).toHaveBeenCalledTimes(1)
    const [, , data, rendered] = vi.mocked(ctx.recordStepOutput).mock.calls[0]!
    expect(data).toMatchObject({ topic: 'otters', items: [] })
    expect(String(rendered)).toContain('network down')
  })

  it('shouldRun is false without a topic', () => {
    const ctx = makeCtx({
      flowStepConfig: { search: {} },
      flowContext: { getLatestUserMessageContent: () => '' },
    })
    expect(new SearchOrchestrator(ctx).shouldRun()).toBe(false)
  })

  it('emits warning when search returns an error with no items', async () => {
    vi.mocked(cascadeWebSearch).mockResolvedValue({
      success: false,
      engine: 'duckduckgo',
      searchUrl: 'https://duckduckgo.com/?q=otters',
      resultCount: 0,
      results: [],
      attempts: [],
      error: 'rate limited',
    })
    vi.mocked(runExpressionLlmText).mockResolvedValue('No hits.')

    const ctx = makeCtx()
    await new SearchOrchestrator(ctx).execute()

    expect(ctx.emitStepProgress).toHaveBeenCalledWith(
      expect.stringContaining('rate limited'),
    )
  })

  it('runs multi-angle search when query expansion is enabled', async () => {
    vi.mocked(runExpressionLlmText)
      .mockResolvedValueOnce('["otters behavior", "otters habitat"]')
      .mockResolvedValueOnce('Merged otter summary.')

    vi.mocked(cascadeWebSearch)
      .mockResolvedValueOnce({
        success: true,
        engine: 'duckduckgo',
        searchUrl: 'https://duckduckgo.com/?q=otters+behavior',
        resultCount: 2,
        results: [
          {
            title: 'Behavior',
            url: 'https://example.com/shared?utm_source=ddg',
            snippet: 'Behavior detail',
          },
          {
            title: 'Play',
            url: 'https://example.com/play',
            snippet: 'Play detail',
          },
        ],
        attempts: [],
      })
      .mockResolvedValueOnce({
        success: true,
        engine: 'bing',
        searchUrl: 'https://bing.com/search?q=otters+habitat',
        resultCount: 2,
        results: [
          {
            title: 'Duplicate',
            url: 'https://example.com/shared',
            snippet: 'Duplicate detail',
          },
          {
            title: 'Habitat',
            url: 'https://example.com/habitat',
            snippet: 'Habitat detail',
          },
        ],
        attempts: [],
      })

    const ctx = makeCtx({
      flowStepConfig: {
        search: {
          topic: 'otters',
          queryExpansionCount: 2,
          perQueryMaxResults: 8,
          totalResultCap: 2,
        },
      },
      currentMessages: [{ role: 'user', content: 'otters' }],
    })

    await new SearchOrchestrator(ctx).execute()

    expect(cascadeWebSearch).toHaveBeenNthCalledWith(
      1,
      'otters behavior',
      8,
      undefined,
    )
    expect(cascadeWebSearch).toHaveBeenNthCalledWith(
      2,
      'otters habitat',
      8,
      undefined,
    )
    expect(ctx.recordStepOutput).toHaveBeenCalledWith(
      'search',
      'Search',
      expect.objectContaining({
        items: [
          expect.objectContaining({
            address: 'https://example.com/shared?utm_source=ddg',
          }),
          expect.objectContaining({ address: 'https://example.com/play' }),
        ],
      }),
      expect.any(String),
      undefined,
      expect.any(String),
      expect.any(String),
    )
  })
})

describe('searchFlowStepDefinition', () => {
  const sampleEntry = {
    stepId: SEARCH_STEP_ID,
    instanceKey: 'search:1',
    timestamp: new Date().toISOString(),
    data: {
      topic: 'otters',
      items: [{ address: 'https://example.com', brief: 'facts' }],
      abstraction: 'Otter summary',
      rendered: '# Search\n\nresults',
      text: '# Search\n\nresults',
    } satisfies SearchStepData,
  }

  it('shouldRun and render helpers mirror search output', () => {
    const flow = new AgentFlowContext(
      {
        provider: 'ollama',
        model: 'test',
        systemPrompt: '',
        messages: [{ role: 'user', content: 'otters' }],
        userId: 'u1',
      },
      {},
    )

    expect(
      searchFlowStepDefinition.shouldRun?.({
        flow,
        config: { search: { topic: 'otters' } },
      } as never),
    ).toBe(true)
    expect(searchFlowStepDefinition.hasOutput?.([sampleEntry])).toBe(true)
    expect(searchFlowStepDefinition.toContextMessages?.([sampleEntry])).toEqual(
      [
        {
          role: 'user',
          content: `${PIPELINE_CONTEXT_LLM.SEARCH_OUTPUT}\n\n# Search\n\nresults`,
        },
      ],
    )
    expect(searchFlowStepDefinition.toSubStep?.([sampleEntry])).toEqual({
      type: 'SearchStep',
      title: SEARCH_STEP_TITLE,
      content: '# Search\n\nresults',
    })
    expect(searchFlowStepDefinition.toStepCapture?.([sampleEntry])).toEqual({
      stepType: 'SearchStep',
      title: SEARCH_STEP_TITLE,
      content: '# Search\n\nresults',
      outputPaths: [],
    })
  })

  it('run executes SearchOrchestrator when topic is configured', async () => {
    vi.mocked(cascadeWebSearch).mockResolvedValue({
      success: true,
      engine: 'duckduckgo',
      searchUrl: 'https://duckduckgo.com/?q=otters',
      resultCount: 0,
      results: [],
      attempts: [],
    })
    vi.mocked(runExpressionLlmText).mockResolvedValue('summary')

    const flow = new AgentFlowContext(
      {
        provider: 'ollama',
        model: 'test',
        systemPrompt: '',
        messages: [{ role: 'user', content: 'otters' }],
        userId: 'u1',
        onChunk: vi.fn(),
      },
      {},
    )

    await searchFlowStepDefinition.run({
      flow,
      config: { search: { topic: 'otters' }, title: 'Custom Search' },
    } as never)

    expect(cascadeWebSearch).toHaveBeenCalledWith('otters', 8, undefined)
  })

  it('hasOutput accepts abstraction-only entries', () => {
    expect(
      searchFlowStepDefinition.hasOutput?.([
        {
          ...sampleEntry,
          data: {
            topic: 'otters',
            items: [],
            abstraction: 'Only abstraction',
          },
        },
      ]),
    ).toBe(true)
  })
})
