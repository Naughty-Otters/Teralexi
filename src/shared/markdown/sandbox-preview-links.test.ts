import { describe, expect, it } from 'vitest'
import { createStandardMarkdownIt } from './create-markdown-it'
import { rewriteSandboxPreviewLinksInHtml } from './sandbox-preview-links'

describe('sandbox preview markdown links', () => {
  it('rewrites file urls to non-navigating preview anchors', () => {
    const md = createStandardMarkdownIt()
    const html = md.render('[Report](file:///tmp/sandbox/output/report.html)')
    expect(html).toContain('class="sandbox-preview-link"')
    expect(html).toContain('data-sandbox-preview-url="file:///tmp/sandbox/output/report.html"')
    expect(html).toContain('href="#"')
    expect(html).not.toContain('href="file:///tmp/sandbox/output/report.html"')
  })

  it('leaves external http links unchanged', () => {
    const md = createStandardMarkdownIt()
    const html = md.render('[Site](https://example.com)')
    expect(html).toContain('href="https://example.com"')
    expect(html).not.toContain('data-sandbox-preview-url')
  })

  it('rewrites file links in raw html output', () => {
    const html = rewriteSandboxPreviewLinksInHtml(
      '<a href="file:///tmp/report.html">Report</a>',
    )
    expect(html).toContain('href="#"')
    expect(html).toContain('data-sandbox-preview-url="file:///tmp/report.html"')
  })
})
