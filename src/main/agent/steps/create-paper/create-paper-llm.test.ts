import { describe, expect, it } from 'vitest'
import {
  CREATE_PAPER_LLM,
  buildCreatePaperMessages,
} from './create-paper-llm'
import type { CollectedPaperInputs } from './collect-sources'

function sampleInputs(
  overrides: Partial<CollectedPaperInputs> = {},
): CollectedPaperInputs {
  return {
    topic: 'river otters',
    abstraction: 'SERP summary only — should not drive findings.',
    searchItems: [{ address: 'https://example.com/a', brief: 'snippet', title: 'A' }],
    skippedWithoutDownload: 0,
    sources: [
      {
        address: 'https://example.com/a',
        title: 'Otters',
        outputPath: '/tmp/001.md',
        markdown:
          '# Otter facts\n\nThey live in rivers and eat fish daily in many regions.',
        fromPriorScrape: true,
      },
    ],
    ...overrides,
  }
}

describe('CREATE_PAPER_LLM', () => {
  it('defines Harvard GSE sections and download-only evidence rules', () => {
    expect(CREATE_PAPER_LLM.DEFAULT_SYSTEM).toContain('Methodology')
    expect(CREATE_PAPER_LLM.DEFAULT_SYSTEM).toContain('Key Findings')
    expect(CREATE_PAPER_LLM.DEFAULT_SYSTEM).toContain(
      'ONLY on the downloaded/scraped page content',
    )
    expect(CREATE_PAPER_LLM.DEFAULT_SYSTEM).toContain(
      'Do NOT treat the search-step abstraction',
    )
    expect(CREATE_PAPER_LLM.DEFAULT_SYSTEM).toContain('SERP snippets excluded')
  })
})

describe('buildCreatePaperMessages', () => {
  it('puts downloaded pages before search abstraction and labels abstraction as non-evidence', () => {
    const content = buildCreatePaperMessages(sampleInputs())[0]!.content
    const downloadIdx = content.indexOf('Downloaded source pages')
    const abstractionIdx = content.indexOf('Search overview (not evidence)')
    const snippetIdx = content.indexOf('Search result snippet')

    expect(downloadIdx).toBeGreaterThan(-1)
    expect(abstractionIdx).toBeGreaterThan(downloadIdx)
    expect(content).toContain('Otter facts')
    expect(content).toContain('orientation only')
    expect(snippetIdx).toBe(-1)
  })

  it('includes downloaded file path and omits per-source SERP snippets', () => {
    const content = buildCreatePaperMessages(sampleInputs())[0]!.content
    expect(content).toContain('Downloaded file: /tmp/001.md')
    expect(content).not.toContain('Search result snippet:')
    expect(content).not.toContain('snippet')
  })

  it('notes skipped search hits when downloads were excluded', () => {
    const content = buildCreatePaperMessages(
      sampleInputs({ skippedWithoutDownload: 4 }),
    )[0]!.content

    expect(content).toContain('4 search result(s)')
    expect(content).toContain('excluded from this report')
  })

  it('prompts the model to admit limitations when no downloads exist', () => {
    const content = buildCreatePaperMessages(
      sampleInputs({ sources: [], skippedWithoutDownload: 2 }),
    )[0]!.content

    expect(content).toContain('No downloaded source pages were available')
    expect(content).toContain('do not invent findings')
  })
})
