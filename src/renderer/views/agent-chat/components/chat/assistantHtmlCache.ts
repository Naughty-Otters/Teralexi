const MAX_ENTRIES = 200

const cache = new Map<string, string>()
const order: string[] = []

function touchKey(key: string): void {
  const idx = order.indexOf(key)
  if (idx >= 0) order.splice(idx, 1)
  order.push(key)
  while (order.length > MAX_ENTRIES) {
    const evict = order.shift()
    if (evict) cache.delete(evict)
  }
}

export function contentHash(text: string): string {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0
  }
  return `${text.length}:${h}`
}

export function getCachedAssistantHtml(
  messageId: string,
  partIndex: number,
  text: string,
): string | undefined {
  const key = `${messageId}:${partIndex}:${contentHash(text)}`
  const hit = cache.get(key)
  if (hit !== undefined) touchKey(key)
  return hit
}

export function setCachedAssistantHtml(
  messageId: string,
  partIndex: number,
  text: string,
  html: string,
): void {
  const key = `${messageId}:${partIndex}:${contentHash(text)}`
  cache.set(key, html)
  touchKey(key)
}

export function clearAssistantHtmlCache(): void {
  cache.clear()
  order.length = 0
}
