import { describe, expect, it } from 'vitest'
import { renderResearchReportHtmlDocument } from './research-report-html'

describe('renderResearchReportHtmlDocument', () => {
  it('wraps Abstract blockquote in abstract-callout', () => {
    const html = renderResearchReportHtmlDocument(
      ['## Abstract', '', '> Research question: river otter populations.', '> Methods: web search and scraping.'].join(
        '\n',
      ),
    )
    expect(html).toContain('abstract-callout')
    expect(html).toMatch(/<h2[^>]*>\s*Abstract\s*<\/h2>/i)
    expect(html).toContain('<blockquote')
  })

  it('adds key-findings-table class to the first table after Key Findings', () => {
    const html = renderResearchReportHtmlDocument(
      [
        '## Key Findings',
        '',
        '| # | Finding | Evidence | Source |',
        '|---|---------|----------|--------|',
        '| 1 | Populations stable | 100k | [1] |',
      ].join('\n'),
    )
    expect(html).toContain('key-findings-table')
    expect(html).not.toMatch(/<table(?![^>]*key-findings-table)/)
  })

  it('includes print-oriented document shell', () => {
    const html = renderResearchReportHtmlDocument('# Title\n\n## Introduction\n\nBody.')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('@page')
    expect(html).toContain('PdfSerif')
    expect(html).toContain('<main>')
  })
})
