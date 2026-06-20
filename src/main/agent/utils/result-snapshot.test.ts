import { describe, expect, it } from 'vitest'
import { injectResultSnapshotIntoStructuredContent } from './result-snapshot'
import { parseAssistantStructuredContent } from './structured-content'

describe('injectResultSnapshotIntoStructuredContent', () => {
  it('adds resultSnapshot and pdf path to artifacts', () => {
    const base = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: { finalResult: 'done', report: '', allArtifactPaths: ['/a'] },
        subSteps: [],
      },
    })
    const out = injectResultSnapshotIntoStructuredContent(base, {
      pdfPath: '/sandbox/output/results/result-snapshot.pdf',
      pdfUrl: 'file:///sandbox/output/results/result-snapshot.pdf',
    })
    const parsed = parseAssistantStructuredContent(out)
    expect(parsed?.assistantContent.outer.resultSnapshot?.pdfUrl).toContain(
      'result-snapshot.pdf',
    )
    expect(parsed?.assistantContent.outer.allArtifactPaths).toContain(
      '/sandbox/output/results/result-snapshot.pdf',
    )
  })

  it('returns input unchanged when JSON is invalid', () => {
    expect(
      injectResultSnapshotIntoStructuredContent('not json', {
        pdfPath: '/x.pdf',
        pdfUrl: 'file:///x.pdf',
      }),
    ).toBe('not json')
  })
})
