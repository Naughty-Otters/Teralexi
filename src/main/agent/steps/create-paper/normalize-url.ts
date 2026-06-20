/** Normalize URLs for matching search hits to scraped pages. */
export function normalizeSourceUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  try {
    const u = new URL(trimmed)
    u.hash = ''
    let href = u.href
    if (href.endsWith('/') && u.pathname !== '/') {
      href = href.slice(0, -1)
    }
    return href.toLowerCase()
  } catch {
    return trimmed.toLowerCase()
  }
}
