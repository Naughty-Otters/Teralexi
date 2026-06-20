/** Placeholder bodies when only SERP snippets were available — not valid report evidence. */
const SNIPPET_ONLY_MARKERS = [
  '_Scraped page content unavailable. Search snippet only:_',
  '_Page could not be fetched. Search snippet only:_',
  '_Scraped page content unavailable._',
  '_Empty excerpt._',
] as const

const MIN_DOWNLOADED_CHARS = 50

export function isSnippetOnlyPlaceholder(markdown: string): boolean {
  const trimmed = markdown.trim()
  if (!trimmed) return true
  return SNIPPET_ONLY_MARKERS.some((marker) => trimmed.startsWith(marker))
}

/** True when markdown is substantive downloaded page text (not a SERP fallback). */
export function isSubstantiveDownloadedContent(markdown: string): boolean {
  const trimmed = markdown.trim()
  if (!trimmed || isSnippetOnlyPlaceholder(trimmed)) return false
  return trimmed.length >= MIN_DOWNLOADED_CHARS
}
