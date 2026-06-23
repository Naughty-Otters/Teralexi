export type PreviewLinkTab = {
  id: string
  url: string
  label: string
}

const MAX_LABEL_LENGTH = 28

function truncateLabel(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length <= MAX_LABEL_LENGTH) return trimmed
  return `${trimmed.slice(0, MAX_LABEL_LENGTH - 1)}…`
}

/** Canonical URL string for tab dedupe (file paths decoded, http URLs normalized). */
export function normalizePreviewTabUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''

  const lower = trimmed.toLowerCase()
  if (lower.startsWith('file://')) {
    let path = trimmed.slice('file://'.length)
    try {
      path = decodeURIComponent(path)
    } catch {
      // keep raw path when not percent-encoded
    }
    if (path.startsWith('//') && !path.startsWith('//localhost')) {
      path = path.slice(1)
    }
    if (!path.startsWith('/')) {
      path = `/${path}`
    }
    return `file://${path}`
  }

  try {
    const parsed = new URL(trimmed)
    return parsed.href
  } catch {
    return trimmed
  }
}

function hashPreviewTabKey(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

export function previewLinkTabIdForUrl(url: string): string {
  const normalized = normalizePreviewTabUrl(url)
  return `link:${hashPreviewTabKey(normalized)}`
}

/** Brief Chrome-style tab title from a preview URL. */
export function labelForPreviewUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return 'Preview'

  const lower = trimmed.toLowerCase()
  if (lower.startsWith('file://')) {
    try {
      const path = decodeURIComponent(trimmed.slice('file://'.length))
      const name = path.split(/[/\\]/).filter(Boolean).pop()
      return truncateLabel(name || 'file')
    } catch {
      return truncateLabel('file')
    }
  }

  try {
    const parsed = new URL(trimmed)
    const pathBase = parsed.pathname.split('/').filter(Boolean).pop()
    if (pathBase && pathBase !== parsed.hostname) {
      return truncateLabel(`${pathBase} · ${parsed.hostname}`)
    }
    return truncateLabel(parsed.hostname || trimmed)
  } catch {
    return truncateLabel(trimmed)
  }
}

export function openPreviewLinkTab(
  tabs: readonly PreviewLinkTab[],
  url: string,
): { tabs: PreviewLinkTab[]; activeTabId: string } {
  const normalized = normalizePreviewTabUrl(url)
  const existing = tabs.find(
    (tab) => normalizePreviewTabUrl(tab.url) === normalized,
  )
  if (existing) {
    return { tabs: [...tabs], activeTabId: existing.id }
  }

  const id = previewLinkTabIdForUrl(normalized)
  const tab: PreviewLinkTab = {
    id,
    url: normalized,
    label: labelForPreviewUrl(normalized),
  }
  return { tabs: [...tabs, tab], activeTabId: tab.id }
}

export function closePreviewLinkTab(
  tabs: readonly PreviewLinkTab[],
  activeTabId: string | null | undefined,
  tabId: string,
): { tabs: PreviewLinkTab[]; activeTabId: string | null } {
  const nextTabs = tabs.filter((tab) => tab.id !== tabId)
  if (activeTabId !== tabId) {
    return { tabs: nextTabs, activeTabId: activeTabId ?? null }
  }
  const closedIndex = tabs.findIndex((tab) => tab.id === tabId)
  if (nextTabs.length === 0) {
    return { tabs: nextTabs, activeTabId: null }
  }
  const nextIndex = Math.min(closedIndex, nextTabs.length - 1)
  return { tabs: nextTabs, activeTabId: nextTabs[nextIndex]?.id ?? null }
}
