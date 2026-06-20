export function isSandboxPreviewHref(href: string): boolean {
  return href.trim().toLowerCase().startsWith('file://')
}

export function handleSandboxPreviewLinkClick(
  event: MouseEvent,
  onOpen: (url: string) => void,
): void {
  const target = event.target
  if (!(target instanceof Element)) return
  const anchor = target.closest('a[href]')
  if (!(anchor instanceof HTMLAnchorElement)) return
  const href = anchor.getAttribute('href')?.trim() ?? ''
  if (!isSandboxPreviewHref(href)) return
  event.preventDefault()
  event.stopPropagation()
  onOpen(href)
}
