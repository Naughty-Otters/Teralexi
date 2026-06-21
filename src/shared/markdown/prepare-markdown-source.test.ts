import { describe, expect, it } from 'vitest'
import MarkdownIt from 'markdown-it'
import {
  HEAD_TAIL_KEEP_CHARS,
  HEAD_TAIL_OMISSION,
} from '@shared/text/truncate-head-tail'
import {
  prepareAndTruncateMarkdownSource,
  prepareMarkdownSource,
  unwrapOuterMarkdownFence,
} from './prepare-markdown-source'

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true })

function renderPrepared(source: string): string {
  return markdown.render(prepareMarkdownSource(source))
}

describe('unwrapOuterMarkdownFence', () => {
  it('unwraps a full markdown prose fence', () => {
    const inner = '### Title\n\n| A | B |\n|---|---|\n| 1 | 2 |'
    const fenced = `\`\`\`markdown\n${inner}\n\`\`\``
    expect(unwrapOuterMarkdownFence(fenced)).toBe(inner)
  })

  it('unwraps same-line prose fences like ```### Title', () => {
    const inner = '### 📬 Today\n\n| A | B |\n|---|---|\n| 1 | 2 |'
    const fenced = `\`\`\`${inner}\n\`\`\``
    expect(unwrapOuterMarkdownFence(fenced)).toBe(inner)
  })

  it('preserves real code fences', () => {
    const fenced = '```python\nprint("hi")\n```'
    expect(unwrapOuterMarkdownFence(fenced)).toBe(fenced)
  })

  it('preserves non-prose language fences like javascript', () => {
    const source = '```javascript\nconst x = 1\n```'
    expect(unwrapOuterMarkdownFence(source)).toBe(source)
  })

  it('handles malformed fence-like content with insufficient backticks', () => {
    const source = '`` not enough backticks\ncontent\n```'
    expect(unwrapOuterMarkdownFence(source)).toBe(source)
  })

  it('handles markdown fence without closing fence by stripping leading only', () => {
    const source = '```markdown\nsome content'
    // stripLeadingProseFence removes the opening markdown fence
    const result = unwrapOuterMarkdownFence(source)
    expect(result).toBe('some content')
  })
})

describe('prepareMarkdownSource', () => {
  it('strips orphan fence lines left by head/tail truncation', () => {
    const row = '| 1 | 3:38 PM | GitHub | subject |\n'
    const rowCount =
      Math.ceil((HEAD_TAIL_KEEP_CHARS * 2 + 1) / row.length) + 1
    const raw =
      '### Title\n' +
      row.repeat(rowCount) +
      '\n```markdown\n' +
      row.repeat(rowCount) +
      '\n```'
    const truncated = prepareAndTruncateMarkdownSource(
      raw,
      HEAD_TAIL_KEEP_CHARS,
    )

    expect(truncated).toContain(HEAD_TAIL_OMISSION.trim())
    expect(truncated).not.toContain('```')

    const html = renderPrepared(truncated)
    expect(html).toContain('<h3>')
    expect(html).not.toContain('<pre>')
    expect(html).not.toContain('###')
  })

  it('prepareAndTruncateMarkdownSource strips fences before truncating', () => {
    const row = '| 1 | 3:38 PM | GitHub | subject |\n'
    const table =
      '| # | Time | From | Subject |\n|---|------|------|----------|\n' +
      row.repeat(40000)
    const raw = `\`\`\`### 📬 Today\n\n${table}\n\`\`\``
    const truncated = prepareAndTruncateMarkdownSource(
      raw,
      HEAD_TAIL_KEEP_CHARS,
    )

    expect(truncated.startsWith('```')).toBe(false)
    expect(truncated).toContain(HEAD_TAIL_OMISSION.trim())

    const html = renderPrepared(truncated)
    expect(html).toContain('<h3>')
    expect(html).not.toContain('<pre>')
  })
})

describe('render path', () => {
  it('renders same-line ```### email digest fences', () => {
    const inner =
      "### 📬 Today's New Emails (7 unread)\n\n| # | Time | From |\n|---|---|---|\n| 1 | 3:38 PM | GitHub |"
    const html = renderPrepared(`\`\`\`${inner}\n\`\`\``)
    expect(html).toContain('<h3>')
    expect(html).toContain('<table>')
    expect(html).not.toContain('<pre>')
  })
})
