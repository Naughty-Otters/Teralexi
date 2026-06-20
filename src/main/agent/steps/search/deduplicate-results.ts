import type { SearchResultItem } from '../search-config'

function canonicalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    url.hash = ''

    const keysToDrop: string[] = []
    url.searchParams.forEach((_value, key) => {
      if (key.toLowerCase().startsWith('utm_')) keysToDrop.push(key)
    })
    for (const key of keysToDrop) url.searchParams.delete(key)

    // Keep root slash but trim trailing slash for non-root paths.
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')

    return url.toString()
  } catch {
    return rawUrl.trim()
  }
}

export function deduplicateAndCapSearchResults(
  items: SearchResultItem[],
  cap: number,
): SearchResultItem[] {
  const limit = Math.max(1, Math.floor(cap))
  const deduped: SearchResultItem[] = []
  const seen = new Set<string>()

  for (const item of items) {
    const key = canonicalizeUrl(item.address)
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
    if (deduped.length >= limit) break
  }

  return deduped
}
