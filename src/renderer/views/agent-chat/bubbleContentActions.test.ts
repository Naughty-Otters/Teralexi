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

  it('writes plain text without markdown decorators to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: undefined,
    })

    await expect(
      copyBubbleMarkdownContent('## Hello **world**'),
    ).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('Hello world')
  })

  it('writes plain and html clipboard payloads when supported', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { write, writeText: vi.fn() } })
    vi.stubGlobal(
      'ClipboardItem',
      class ClipboardItem {
        constructor(public items: Record<string, Blob>) {}
      },
    )
    vi.stubGlobal(
      'Blob',
      class Blob {
        constructor(
          public parts: string[],
          public options: { type: string },
        ) {}
      },
    )

    await expect(copyBubbleMarkdownContent('**Bold** text')).resolves.toBe(true)
    expect(write).toHaveBeenCalledTimes(1)
    const payload = write.mock.calls[0]?.[0] as Array<{ items: Record<string, Blob> }>
    expect(payload[0]?.items['text/plain']?.parts[0]).toBe('Bold text')
    expect(payload[0]?.items['text/html']?.parts[0]).toContain('<strong>Bold</strong>')
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
