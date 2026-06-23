/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import {

  handleChatPanelLinkClick,
  isChatPreviewHref,
  isInsideChatMessageLinkScope,
} from './sandboxPreview'

describe('isChatPreviewHref', () => {
  it('accepts file, http, and https URLs', () => {
    expect(isChatPreviewHref('file:///tmp/a.html')).toBe(true)
    expect(isChatPreviewHref('https://example.com/x')).toBe(true)
    expect(isChatPreviewHref('http://localhost:3000/')).toBe(true)
  })

  it('rejects non-preview schemes and fragments', () => {
    expect(isChatPreviewHref('#section')).toBe(false)
    expect(isChatPreviewHref('mailto:a@b.com')).toBe(false)
    expect(isChatPreviewHref('javascript:alert(1)')).toBe(false)
    expect(isChatPreviewHref('')).toBe(false)
  })
})

describe('isInsideChatMessageLinkScope', () => {
  it('matches links inside chat scroll but not composer', () => {
    document.body.innerHTML = `
      <div class="chat-scroll">
        <a id="in-scroll" href="https://example.com">x</a>
      </div>
      <form class="chat-composer">
        <a id="in-composer" href="https://example.com">y</a>
      </form>
    `
    expect(
      isInsideChatMessageLinkScope(
        document.getElementById('in-scroll') as HTMLAnchorElement,
      ),
    ).toBe(true)
    expect(
      isInsideChatMessageLinkScope(
        document.getElementById('in-composer') as HTMLAnchorElement,
      ),
    ).toBe(false)
  })
})

describe('handleChatPanelLinkClick', () => {
  it('opens previewable chat links in the right panel callback', () => {
    document.body.innerHTML = `
      <div class="chat-scroll">
        <a id="link" href="https://example.com/doc">open</a>
      </div>
    `
    const anchor = document.getElementById('link') as HTMLAnchorElement
    const onOpen = vi.fn()
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: anchor })

    handleChatPanelLinkClick(event, onOpen)

    expect(event.defaultPrevented).toBe(true)
    expect(onOpen).toHaveBeenCalledWith('https://example.com/doc')
  })
})
