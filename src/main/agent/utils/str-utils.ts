export function truncateString(content: string, maxChars: number): string {
  const trimmed = content.trim()
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, maxChars)}\n…`
}
