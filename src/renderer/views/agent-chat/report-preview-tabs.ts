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

  const withScheme = ensurePreviewUrlScheme(trimmed)
  const lower = withScheme.toLowerCase()
  if (lower.startsWith('file://')) {
    let path = withScheme.slice('file://'.length)
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
    const parsed = new URL(withScheme)
    return parsed.href
  } catch {
    return withScheme
  }
}

/**
 * Address-bar input without a scheme defaults to https://
 * (e.g. www.google.com → https://www.google.com/).
 * Local file paths and URLs that already have a scheme are left alone.
 */
export function ensurePreviewUrlScheme(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (hasExplicitUrlScheme(trimmed) || looksLikeLocalFilePath(trimmed)) {
    return trimmed
  }
  return `https://${trimmed}`
}

function hasExplicitUrlScheme(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
}

function looksLikeLocalFilePath(value: string): boolean {
  if (value.startsWith('/') || value.startsWith('~/') || value.startsWith('~\\')) {
    return true
  }
  return /^[a-zA-Z]:[\\/]/.test(value)
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

/** Always appends a new blank tab (does not dedupe empty URLs). */
export function createEmptyPreviewLinkTab(
  tabs: readonly PreviewLinkTab[],
): { tabs: PreviewLinkTab[]; activeTabId: string } {
  const id = `link:empty:${crypto.randomUUID()}`
  const tab: PreviewLinkTab = {
    id,
    url: '',
    label: 'New tab',
  }
  return { tabs: [...tabs, tab], activeTabId: tab.id }
}

export function updatePreviewLinkTabUrl(
  tabs: readonly PreviewLinkTab[],
  tabId: string,
  url: string,
): PreviewLinkTab[] {
  const normalized = normalizePreviewTabUrl(url)
  const label = normalized ? labelForPreviewUrl(normalized) : 'New tab'
  return tabs.map((tab) =>
    tab.id === tabId ? { ...tab, url: normalized, label } : tab,
  )
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
