import { isSandboxPreviewHref } from '@shared/markdown/sandbox-preview-links'

export { isSandboxPreviewHref }

function readPreviewUrlFromElement(element: Element): string | null {
  const previewNode = element.closest(
    '[data-sandbox-preview-url], [data-step-output-preview-url]',
  )
  if (previewNode instanceof HTMLElement) {
    const fromData =
      previewNode.dataset.sandboxPreviewUrl?.trim() ||
      previewNode.dataset.stepOutputPreviewUrl?.trim()
    if (fromData) return fromData
  }

  const anchor = element.closest('a[href]')
  if (anchor instanceof HTMLAnchorElement) {
    const href = anchor.getAttribute('href')?.trim() ?? ''
    if (isSandboxPreviewHref(href)) return href
  }

  if (element.classList.contains('sandbox-preview-link')) {
    const href = element.getAttribute('href')?.trim() ?? ''
    if (isSandboxPreviewHref(href)) return href
  }

  return null
}

export function resolveSandboxPreviewUrlFromElement(
  element: Element,
): string | null {
  return readPreviewUrlFromElement(element)
}

export function handleSandboxPreviewLinkClick(
  event: MouseEvent,
  onOpen: (url: string) => void,
): void {
  const target = event.target
  if (!(target instanceof Element)) return

  const previewUrl = readPreviewUrlFromElement(target)
  if (!previewUrl) return

  event.preventDefault()
  event.stopPropagation()
  onOpen(previewUrl)
}
