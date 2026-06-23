/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  copyBubbleMarkdownContent,
  printBubbleMarkdownContent,
} from './bubbleContentActions'

describe('copyBubbleMarkdownContent', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns false for empty markdown', async () => {
    await expect(copyBubbleMarkdownContent('')).resolves.toBe(false)
    await expect(copyBubbleMarkdownContent('   ')).resolves.toBe(false)
  })

  it('writes trimmed markdown to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(copyBubbleMarkdownContent('  hello\nworld  ')).resolves.toBe(
      true,
    )
    expect(writeText).toHaveBeenCalledWith('hello\nworld')
  })
})

describe('printBubbleMarkdownContent', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('does nothing for empty markdown', () => {
    const appendChild = vi.spyOn(document.body, 'appendChild')
    printBubbleMarkdownContent({ markdown: '   ' })
    expect(appendChild).not.toHaveBeenCalled()
  })

  it('creates a hidden iframe with rendered markdown', () => {
    printBubbleMarkdownContent({
      markdown: '# Title\n\nParagraph',
      title: 'Summary',
    })

    const iframe = document.querySelector('iframe')
    expect(iframe).toBeTruthy()
    expect(iframe?.getAttribute('aria-hidden')).toBe('true')
    expect(iframe?.contentDocument?.title).toBe('Summary')
    expect(iframe?.contentDocument?.body.innerHTML).toContain('<h1>Title</h1>')
  })
})
