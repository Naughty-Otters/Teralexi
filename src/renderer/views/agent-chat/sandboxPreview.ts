
const CHAT_MESSAGE_LINK_ROOT_SELECTOR =
  '.chat-scroll, .conv-workspace-files, .conversation-view'

const CHAT_LINK_EXCLUDE_SELECTOR =
  '.chat-composer, .report-panel, .workspace-panel, .chat-header'

/** @deprecated Use {@link isChatPreviewHref}. */
export function isSandboxPreviewHref(href: string): boolean {
  return isChatPreviewHref(href)
}

export function isChatPreviewHref(href: string): boolean {
  const trimmed = href.trim()
  if (!trimmed || trimmed === '#') return false
  if (trimmed.startsWith('#')) return false

  const lower = trimmed.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    lower.startsWith('data:')
  ) {
    return false
  }

  return (
    lower.startsWith('file://') ||
    lower.startsWith('http://') ||
    lower.startsWith('https://')
  )
}

export function isInsideChatMessageLinkScope(anchor: Element): boolean {
  if (anchor.closest(CHAT_LINK_EXCLUDE_SELECTOR)) return false
  return !!anchor.closest(CHAT_MESSAGE_LINK_ROOT_SELECTOR)
}

export function handleChatPanelLinkClick(
  event: MouseEvent,
  onOpen: (url: string) => void,
): void {
  const target = event.target
  if (!(target instanceof Element)) return

  const anchor = target.closest('a[href]')
  if (!(anchor instanceof HTMLAnchorElement)) return
  if (!isInsideChatMessageLinkScope(anchor)) return

  const href = anchor.getAttribute('href')?.trim() ?? ''
  if (!isChatPreviewHref(href)) return
  event.preventDefault()
  event.stopPropagation()
  onOpen(previewUrl)
}

/** @deprecated Use {@link handleChatPanelLinkClick}. */
export function handleSandboxPreviewLinkClick(
  event: MouseEvent,
  onOpen: (url: string) => void,
): void {
  handleChatPanelLinkClick(event, onOpen)
}
