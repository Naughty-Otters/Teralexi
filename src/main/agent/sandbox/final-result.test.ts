import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  FINAL_RESULT_FILENAME,
  writeFinalResultToSandbox,
} from './final-result'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
  }
})

describe('writeFinalResultToSandbox', () => {
  beforeEach(() => {
    vi.mocked(mkdir).mockClear()
    vi.mocked(writeFile).mockClear()
  })

  it('writes HTML from structured assistant JSON', async () => {
    const structured = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: { finalResult: '# Hello', report: '', stepCaptures: [] },
        subSteps: [],
      },
    })
    const result = await writeFinalResultToSandbox('/sandbox', structured)
    expect(result.resultFilePath).toContain(FINAL_RESULT_FILENAME)
    expect(writeFile).toHaveBeenCalled()
    const html = String(vi.mocked(writeFile).mock.calls[0]?.[1] ?? '')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Hello')
    expect(result.resultsFileUrl).toContain(FINAL_RESULT_FILENAME)
  })

  it('includes research report excerpt without pipeline titles', async () => {
    const structured = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: {
          finalResult: '## Research report\n\nDigest text',
          report: '',
          stepCaptures: [],
          researchReport: {
            pdfPath: '/sandbox/createPaper/output/research-report.pdf',
            pdfUrl: 'file:///sandbox/createPaper/output/research-report.pdf',
            topic: 'Otters',
            sourceCount: 2,
            paperExcerpt: 'Key finding about otters.',
          },
        },
        subSteps: [],
      },
    })
    await writeFinalResultToSandbox('/sandbox', structured)
    const html = String(vi.mocked(writeFile).mock.calls[0]?.[1] ?? '')
    expect(html).toContain('Key finding about otters')
    expect(html).not.toContain('Research report')
    expect(html).not.toContain('Otters')
    expect(html).not.toContain('research-report.pdf')
  })

  it('includes report body without pipeline section titles or step captures', async () => {
    const structured = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: {
          finalResult: 'Final answer',
          report: 'Detailed report',
          stepCaptures: [
            {
              stepType: 'SearchStep',
              title: 'Search',
              content: 'Found pages',
              outputPaths: ['/sandbox/search/output/hits.md'],
            },
          ],
          allArtifactPaths: ['/sandbox/search/output/hits.md'],
        },
        subSteps: [],
      },
    })
    await writeFinalResultToSandbox('/sandbox', structured)
    const html = String(vi.mocked(writeFile).mock.calls[0]?.[1] ?? '')
    expect(html).toContain('Detailed report')
    expect(html).not.toContain('Final answer')
    expect(html).not.toContain('Found pages')
    expect(html).not.toContain('hits.md')
    expect(html).not.toContain('Artifact index')
    expect(html).not.toContain('Final result')
    expect(html).not.toContain('Step outputs')
  })

  it('renders agentic prose without internal pipeline titles', async () => {
    const structured = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: {
          finalResult:
            '**Skills & tool execution**\n\n**Agentic Run**\n\nI am **Claude**, built by **Anthropic**.',
          report: '',
          pipelineConversation: [
            {
              sectionId: 'SkillsToolExecutionStep',
              stepId: 'toolLoop',
              title: 'Agentic Run',
              content:
                'I am **Claude**, built by **Anthropic**. Is there something I can help you with?',
              status: 'completed',
            },
          ],
        },
        subSteps: [],
      },
    })
    await writeFinalResultToSandbox('/sandbox', structured)
    const html = String(vi.mocked(writeFile).mock.calls[0]?.[1] ?? '')
    expect(html).toContain('<strong>Claude</strong>')
    expect(html).not.toContain('Agentic Run')
    expect(html).not.toContain('Skills &amp; tool execution')
    expect(html).not.toContain('Raw assistant output')
  })

  it('shows a short message when parsing fails', async () => {
    const result = await writeFinalResultToSandbox('/sandbox', 'not-json')
    expect(result.resultsFileUrl).toContain('results')
    const html = String(vi.mocked(writeFile).mock.calls[0]?.[1] ?? '')
    expect(html).toContain('No result content available')
  })

  it('shows a short message when structured content has no sections', async () => {
    const structured = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: { finalResult: '', report: '', stepCaptures: [] },
        subSteps: [],
      },
    })
    await writeFinalResultToSandbox('/sandbox', structured)
    const html = String(vi.mocked(writeFile).mock.calls.at(-1)?.[1] ?? '')
    expect(html).toContain('No result content available')
  })
})
