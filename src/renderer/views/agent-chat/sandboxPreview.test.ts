/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import {
  handleSandboxPreviewLinkClick,
  isSandboxPreviewHref,
  resolveSandboxPreviewUrlFromElement,
} from './sandboxPreview'

describe('sandboxPreview', () => {
  it('detects file urls', () => {
    expect(isSandboxPreviewHref('file:///tmp/out.html')).toBe(true)
    expect(isSandboxPreviewHref('https://example.com')).toBe(false)
  })

  it('resolves sandbox preview links by class and data attribute', () => {
    document.body.innerHTML = `
      <a href="#" class="sandbox-preview-link" data-sandbox-preview-url="file:///tmp/report.html">Report</a>
      <a href="#" class="sandbox-preview-link" data-sandbox-preview-url="file:///tmp/from-data.html">
        <span class="step-output-link-preview__status">Loading</span>
      </a>
    `
    const label = document.querySelector('.sandbox-preview-link')!
    expect(resolveSandboxPreviewUrlFromElement(label)).toBe(
      'file:///tmp/report.html',
    )

    const status = document.querySelector('.step-output-link-preview__status')!
    expect(resolveSandboxPreviewUrlFromElement(status)).toBe(
      'file:///tmp/from-data.html',
    )
  })

  it('opens preview in capture handler and prevents navigation', () => {
    document.body.innerHTML =
      '<a href="#" class="sandbox-preview-link" data-sandbox-preview-url="file:///tmp/a.html">Open</a>'
    const anchor = document.querySelector('a')!
    const onOpen = vi.fn()
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: anchor })
    Object.defineProperty(event, 'currentTarget', { value: document.body })

    handleSandboxPreviewLinkClick(event, onOpen)

    expect(onOpen).toHaveBeenCalledWith('file:///tmp/a.html')
    expect(event.defaultPrevented).toBe(true)
  })
})
