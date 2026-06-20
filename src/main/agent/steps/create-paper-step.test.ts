import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CreatePaperOrchestrator } from './create-paper-step'
import type { AgentStepContext } from './context'

const collectPaperInputsMock = vi.fn()
const generateResearchPaperMarkdownMock = vi.fn()
const exportMarkdownBodyToPdfMock = vi.fn()

vi.mock('./create-paper/collect-sources', () => ({
  collectPaperInputs: (...args: unknown[]) => collectPaperInputsMock(...args),
}))

vi.mock('./create-paper/create-paper-llm', () => ({
  generateResearchPaperMarkdown: (...args: unknown[]) =>
    generateResearchPaperMarkdownMock(...args),
}))

vi.mock('../sandbox/markdown-to-pdf', () => ({
  exportMarkdownBodyToPdf: (...args: unknown[]) =>
    exportMarkdownBodyToPdfMock(...args),
}))

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

function makeCtx(): AgentStepContext & { emitted: string[] } {
  const emitted: string[] = []
  const flowContext = {
    outputStore: { latest: vi.fn(), all: vi.fn(() => []) },
    getLatestUserMessageContent: () => 'topic',
  }
  return {
    flowContext,
    agentFlow: flowContext,
    flowStepConfig: { createPaper: { topic: 'river otters' } },
    opts: {},
    config: { withResponseLanguageInstruction: (t: string) => t },
    currentMessages: [],
    sandbox: {
      getRoot: () => '/tmp/sandbox',
    },
    beginStep: vi.fn(),
    emitStepProgress: vi.fn((chunk: string) => {
      emitted.push(chunk)
    }),
    recordStepOutput: vi.fn(),
    appendAssistantTurn: vi.fn(),
    emitted,
  } as unknown as AgentStepContext & { emitted: string[] }
}

describe('CreatePaperOrchestrator', () => {
  beforeEach(() => {
    collectPaperInputsMock.mockReset()
    generateResearchPaperMarkdownMock.mockReset()
    exportMarkdownBodyToPdfMock.mockReset()
    generateResearchPaperMarkdownMock.mockResolvedValue('# Report\n\nBody.')
    exportMarkdownBodyToPdfMock.mockResolvedValue(undefined)
  })

  it('warns when no downloaded sources are available', async () => {
    collectPaperInputsMock.mockResolvedValue({
      topic: 'river otters',
      abstraction: 'SERP only',
      searchItems: [{ address: 'https://example.com', brief: 'x' }],
      sources: [],
      skippedWithoutDownload: 2,
    })

    const ctx = makeCtx()
    await new CreatePaperOrchestrator(ctx).execute()

    const progress = ctx.emitted.join('')
    expect(progress).toContain('No downloaded pages')
    expect(progress).not.toContain('Drafting paper from scraped content')
    expect(generateResearchPaperMarkdownMock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ sources: [] }),
      undefined,
    )
  })

  it('reports partial skips when some downloads are missing', async () => {
    collectPaperInputsMock.mockResolvedValue({
      topic: 'river otters',
      abstraction: 'Overview',
      searchItems: [],
      sources: [
        {
          address: 'https://example.com/a',
          outputPath: '/tmp/a.md',
          markdown: 'x'.repeat(60),
          fromPriorScrape: true,
        },
      ],
      skippedWithoutDownload: 3,
    })

    const ctx = makeCtx()
    await new CreatePaperOrchestrator(ctx).execute()

    const progress = ctx.emitted.join('')
    expect(progress).toContain('1 downloaded page')
    expect(progress).toContain('3 search hit(s) skipped')
    expect(exportMarkdownBodyToPdfMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('research-report.pdf'),
      'research-report',
    )
  })
})
