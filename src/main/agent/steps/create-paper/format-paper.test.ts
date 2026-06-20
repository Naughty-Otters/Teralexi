import { describe, expect, it } from 'vitest'
import {
  formatCreatePaperDigest,
  formatCreatePaperProgress,
  formatResearchReportBubbleBody,
} from './format-paper'

describe('formatCreatePaperDigest', () => {
  it('leads with report excerpt and places search overview after the report', () => {
    const md = formatCreatePaperDigest({
      topic: 'Quantum computing',
      abstraction: 'Broad interest in qubits.',
      sourceCount: 3,
      outputPath: '/tmp/research-report.pdf',
      paperMarkdown: '# Quantum Computing\n\n## Abstract\n\nThis report surveys the field.',
    })
    expect(md).toContain('# Research report: Quantum computing')
    expect(md).toContain('## Report (from downloaded pages)')
    expect(md).toContain('## Abstract')
    const reportIdx = md.indexOf('## Report (from downloaded pages)')
    const searchIdx = md.indexOf('## Search overview (not used as report body)')
    expect(reportIdx).toBeGreaterThan(-1)
    expect(searchIdx).toBeGreaterThan(reportIdx)
    expect(md).toContain('Broad interest in qubits')
    expect(md).toContain('research-report.pdf')
  })

  it('truncates very long paper markdown and handles empty fields', () => {
    const md = formatCreatePaperDigest({
      topic: '  ',
      abstraction: '  ',
      sourceCount: 0,
      outputPath: '/tmp/report.pdf',
      paperMarkdown: 'x'.repeat(3_000),
    })
    expect(md).toContain('# Research report: (topic)')
    expect(md).not.toContain('## Search overview')
    expect(md.length).toBeLessThan(3_500)
    expect(md.endsWith('…')).toBe(true)
  })

  it('uses empty-report placeholder when paper markdown is blank', () => {
    const md = formatCreatePaperDigest({
      topic: 'Otters',
      abstraction: 'Summary',
      sourceCount: 1,
      outputPath: '/tmp/report.pdf',
      paperMarkdown: '   ',
    })
    expect(md).toContain('_Empty report._')
  })
})

describe('formatCreatePaperProgress', () => {
  it('formats progress lines for chat output', () => {
    expect(
      formatCreatePaperProgress(
        {
          topic: 'Otters',
          abstraction: '',
          searchItems: [],
          skippedWithoutDownload: 0,
          sources: [
            {
              address: 'https://a',
              outputPath: '/a.md',
              markdown: 'a',
              fromPriorScrape: true,
            },
            {
              address: 'https://b',
              outputPath: '/b.md',
              markdown: 'b',
              fromPriorScrape: true,
            },
          ],
        },
        '/tmp/research-report.pdf',
      ),
    ).toContain('Sources used: 2')
  })

  it('uses fallback topic label when topic is empty', () => {
    expect(
      formatCreatePaperProgress({ topic: '', sources: [] }, '/tmp/out/report.pdf'),
    ).toContain('Topic: (none)')
  })
})

describe('formatResearchReportBubbleBody', () => {
  it('delegates to formatCreatePaperDigest', () => {
    const md = formatResearchReportBubbleBody({
      topic: 'Otters',
      sourceCount: 1,
      outputPath: '/tmp/report.pdf',
      abstraction: 'Summary',
      paperMarkdown: '# Paper',
    })
    expect(md).toContain('# Research report: Otters')
    expect(md).toContain('# Paper')
  })
})
