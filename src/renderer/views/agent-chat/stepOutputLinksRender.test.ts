import { describe, expect, it } from 'vitest'
import {
  renderStepOutputLinksHtml,
  stripLegacyOutputsMarkdown,
} from './stepOutputLinksRender'

describe('stepOutputLinksRender', () => {
  it('returns empty html when no links', () => {
    expect(renderStepOutputLinksHtml([])).toBe('')
    expect(renderStepOutputLinksHtml(undefined)).toBe('')
  })

  it('renders link cards with preview placeholder', () => {
    const html = renderStepOutputLinksHtml([
      { label: 'result.html', url: 'file:///tmp/result.html' },
    ])
    expect(html).toContain('step-output-link-card')
    expect(html).toContain('sandbox-preview-link')
    expect(html).toContain('href="file:///tmp/result.html"')
    expect(html).toContain(
      'data-step-output-preview-url="file:///tmp/result.html"',
    )
    expect(html).toContain('result.html')
  })

  it('renders a label anchor and a preview anchor inside each card', () => {
    const html = renderStepOutputLinksHtml([
      { label: 'report.html', url: 'file:///out/report.html' },
    ])
    expect(html).toContain('step-output-link-card__label')
    expect(html).toContain('step-output-link-preview')
    expect(html).toContain('step-output-link-preview--loading')
    expect(html).toContain('step-output-link-preview__status')
    expect(html).toContain('Loading preview')
  })

  it('sets aria-label on the preview anchor', () => {
    const html = renderStepOutputLinksHtml([
      { label: 'My Report', url: 'file:///out/report.html' },
    ])
    expect(html).toContain('aria-label="Open My Report"')
  })

  it('does not include a title paragraph element', () => {
    const html = renderStepOutputLinksHtml([
      { label: 'a.html', url: 'file:///a.html' },
    ])
    expect(html).not.toContain('step-output-links__title')
    expect(html).not.toContain('<p')
  })

  it('renders multiple link cards', () => {
    const html = renderStepOutputLinksHtml([
      { label: 'first.html', url: 'file:///first.html' },
      { label: 'second.html', url: 'file:///second.html' },
    ])
    expect(html).toContain('href="file:///first.html"')
    expect(html).toContain('href="file:///second.html"')
    const cardCount = (html.match(/step-output-link-card"/g) ?? []).length
    expect(cardCount).toBe(2)
  })

  it('HTML-escapes special characters in url and label', () => {
    const html = renderStepOutputLinksHtml([
      { label: '<b>bold & cool</b>', url: 'https://example.com/?a=1&b="2"' },
    ])
    // URL escaping
    expect(html).toContain(
      'href="https://example.com/?a=1&amp;b=&quot;2&quot;"',
    )
    expect(html).toContain(
      'data-step-output-preview-url="https://example.com/?a=1&amp;b=&quot;2&quot;"',
    )
    // Label escaping
    expect(html).toContain('&lt;b&gt;bold &amp; cool&lt;/b&gt;')
    // Raw unescaped values must not appear
    expect(html).not.toContain('<b>')
    expect(html).not.toContain('b="2"')
  })

  it('strips legacy markdown outputs block', () => {
    expect(
      stripLegacyOutputsMarkdown('Step body\n\n**Outputs:**\n- [x](file:///a)'),
    ).toBe('Step body')
  })

  it('returns content unchanged when no legacy outputs marker is present', () => {
    const content = 'No outputs here, just plain text.'
    expect(stripLegacyOutputsMarkdown(content)).toBe(content)
  })

  it('strips legacy marker even when preceded by trailing whitespace', () => {
    const result = stripLegacyOutputsMarkdown('Body   \n\n**Outputs:**\n- item')
    expect(result).toBe('Body')
  })
})
