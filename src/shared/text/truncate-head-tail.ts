/** Chars kept from the start and end when text is truncated. */
export const HEAD_TAIL_KEEP_CHARS = 2000

/** Middle replacement when start + end are kept. */
export const HEAD_TAIL_OMISSION = '\n....\n'

/**
 * Keep the first and last `keepChars` characters; replace everything between
 * with `omission` (default `\n....\n`).
 */
export function truncateHeadTail(
  text: string,
  keepChars: number = HEAD_TAIL_KEEP_CHARS,
  omission: string = HEAD_TAIL_OMISSION,
): string {
  if (!text) return text
  const maxPlain = keepChars * 2
  if (text.length <= maxPlain) return text
  return `${text.slice(0, keepChars)}${omission}${text.slice(-keepChars)}`
}
