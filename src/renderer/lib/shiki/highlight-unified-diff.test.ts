import { describe, expect, it } from 'vitest'
import {
  classifyLineForTest,
  extractShikiInnerHtml,
  highlightUnifiedDiff,
} from './highlight-unified-diff'

describe('highlight-unified-diff', () => {
  it('classifies diff lines', () => {
    expect(classifyLineForTest('@@ -1,3 +1,3 @@')).toBe('hunk')
    expect(classifyLineForTest('+added')).toBe('add')
    expect(classifyLineForTest('-removed')).toBe('remove')
  })

  it('extracts inner code from shiki fragment', () => {
    const html = extractShikiInnerHtml(
      '<pre class="shiki"><code><span>const</span></code></pre>',
    )
    expect(html).toContain('<span>const</span>')
  })

  it('highlights a small unified diff', async () => {
    const diff = [
      '--- a.ts',
      '+++ b.ts',
      '@@ -1,2 +1,2 @@',
      '-old',
      '+new',
    ].join('\n')

    const lines = await highlightUnifiedDiff(diff, {
      filePath: 'src/a.ts',
      isDark: true,
    })

    expect(lines.length).toBe(5)
    expect(lines[3].kind).toBe('remove')
    expect(lines[4].kind).toBe('add')
    expect(lines[4].html).toContain('span')
  })
})
