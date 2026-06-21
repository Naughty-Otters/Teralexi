import { describe, expect, it } from 'vitest'
import { isMarkdownPreviewFileUrl } from './markdown-preview-url'

describe('isMarkdownPreviewFileUrl', () => {
  it('detects markdown file urls', () => {
    expect(
      isMarkdownPreviewFileUrl('file:///tmp/output/results/paper.md'),
    ).toBe(true)
    expect(
      isMarkdownPreviewFileUrl('file:///tmp/output/results/paper.MARKDOWN'),
    ).toBe(true)
  })

  it('ignores directory listings and non-markdown files', () => {
    expect(isMarkdownPreviewFileUrl('file:///tmp/output/results/')).toBe(false)
    expect(isMarkdownPreviewFileUrl('file:///tmp/output/results/paper.pdf')).toBe(
      false,
    )
  })
})
