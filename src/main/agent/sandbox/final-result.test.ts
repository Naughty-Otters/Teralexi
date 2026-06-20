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

  it('includes research report metadata in snapshot body', async () => {
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
    expect(html).toContain('Research report')
    expect(html).toContain('Otters')
    expect(html).toContain('Key finding about otters')
    expect(html).toContain('research-report.pdf')
  })

  it('includes report, captures, and artifact index sections', async () => {
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
    expect(html).toContain('Final answer')
    expect(html).toContain('Detailed report')
    expect(html).toContain('Found pages')
    expect(html).toContain('hits.md')
  })

  it('falls back to raw JSON when parsing fails', async () => {
    const result = await writeFinalResultToSandbox('/sandbox', 'not-json')
    expect(result.resultsFileUrl).toContain('results')
    const html = String(vi.mocked(writeFile).mock.calls[0]?.[1] ?? '')
    expect(html).toContain('not-json')
  })

  it('falls back to raw JSON body when structured content has no sections', async () => {
    const structured = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: { finalResult: '', report: '', stepCaptures: [] },
        subSteps: [],
      },
    })
    await writeFinalResultToSandbox('/sandbox', structured)
    const html = String(vi.mocked(writeFile).mock.calls.at(-1)?.[1] ?? '')
    expect(html).toContain('Raw assistant output')
  })
})
