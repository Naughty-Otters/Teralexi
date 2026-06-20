import { describe, expect, it } from 'vitest'
import { appendPaperReferences } from './paper-references'
import type { CollectedPaperInputs } from './collect-sources'

describe('appendPaperReferences', () => {
  const inputs: CollectedPaperInputs = {
    topic: 'Otters',
    abstraction: 'Summary',
    searchItems: [
      {
        address: 'https://example.com/a',
        title: 'Source A',
        brief: 'About A',
      },
      {
        address: 'https://example.com/b',
        title: 'Source B',
        brief: 'About B',
      },
    ],
    sources: [
      {
        address: 'https://example.com/a',
        title: 'Source A',
        brief: 'About A',
        outputPath: '/tmp/a.md',
        markdown: 'content a',
        fromPriorScrape: true,
      },
    ],
    skippedWithoutDownload: 1,
  }

  it('appends numbered references with full URLs', () => {
    const result = appendPaperReferences('# Report\n\nBody.', inputs)
    expect(result).toContain('## References')
    expect(result).toContain('1. **Source A** — https://example.com/a')
    expect(result).toContain('2. **Source B** — https://example.com/b')
  })

  it('replaces an LLM-authored references section', () => {
    const result = appendPaperReferences(
      '# Report\n\n## References\n\n1. Wrong link',
      inputs,
    )
    expect(result).not.toContain('Wrong link')
    expect(result).toContain('https://example.com/b')
  })
})
