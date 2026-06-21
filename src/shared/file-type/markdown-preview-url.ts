/** True when a sandbox preview URL points at a markdown file (not a directory listing). */
export function isMarkdownPreviewFileUrl(fileUrl: string | null | undefined): boolean {
  const trimmed = fileUrl?.trim()
  if (!trimmed) return false
  if (trimmed.endsWith('/')) return false
  try {
    const path = decodeURIComponent(new URL(trimmed).pathname)
    return /\.(md|markdown)$/i.test(path)
  } catch {
    return /\.(md|markdown)($|[?#])/i.test(trimmed)
  }
}

export type MarkdownPreviewViewMode = 'html' | 'raw'
