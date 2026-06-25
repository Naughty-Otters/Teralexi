/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { htmlToPlainText, markdownToPlainText } from './markdown-to-plain-text'

describe('markdownToPlainText', () => {
  it('strips heading and emphasis markers', () => {
    expect(markdownToPlainText('## Hello **world**')).toBe('Hello world')
  })

  it('preserves list structure with bullets', () => {
    expect(markdownToPlainText('- one\n- two')).toBe('• one\n• two')
  })

  it('keeps code block content without fences', () => {
    expect(markdownToPlainText('```js\nconst x = 1\n```')).toBe('const x = 1')
  })

  it('includes link URLs in plain text', () => {
    expect(markdownToPlainText('[Docs](https://example.com/docs)')).toBe(
      'Docs (https://example.com/docs)',
    )
  })

  it('unwraps inline code markers', () => {
    expect(markdownToPlainText('Use `npm run dev` here')).toBe(
      'Use npm run dev here',
    )
  })
})

describe('htmlToPlainText', () => {
  it('falls back without DOM using regex stripping', () => {
    const originalDocument = globalThis.document
    // @ts-expect-error test fallback path
    delete globalThis.document
    try {
      expect(htmlToPlainText('<p><strong>Hi</strong></p>')).toBe('Hi')
    } finally {
      globalThis.document = originalDocument
    }
  })
})
