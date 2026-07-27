import { describe, expect, it } from 'vitest'
import { extractShikiInnerHtml } from './highlighter'

describe('extractShikiInnerHtml', () => {
  it('extracts inner code from shiki fragment', () => {
    const html = extractShikiInnerHtml(
      '<pre class="shiki"><code><span>const</span></code></pre>',
    )
    expect(html).toContain('<span>const</span>')
  })
})
