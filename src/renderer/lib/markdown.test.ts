import { describe, expect, it } from 'vitest'
import {
  createRendererMarkdown,
  renderMarkdownHtml,
} from './markdown'

describe('renderMarkdownHtml', () => {
  it('renders bold markdown', () => {
    const html = renderMarkdownHtml('**bold**')
    expect(html).toContain('<strong>')
    expect(html).toContain('bold')
  })

  it('renders headings and tables inside outer markdown fences', () => {
    const inner = '### Title\n\n| A | B |\n|---|---|\n| 1 | 2 |'
    const html = renderMarkdownHtml(`\`\`\`markdown\n${inner}\n\`\`\``)
    expect(html).toContain('<h3>')
    expect(html).toContain('<table>')
    expect(html).not.toContain('<pre>')
    expect(html).not.toContain('###')
  })

  it('does not pass through raw script tags as executable html', () => {
    const html = renderMarkdownHtml('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(renderMarkdownHtml('   \n  ')).toBe('')
  })

  it('createRendererMarkdown uses html:false', () => {
    const md = createRendererMarkdown()
    const html = md.render('<img onerror=alert(1) src=x>')
    expect(html).not.toMatch(/<img/i)
  })
})
