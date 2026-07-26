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

/**
 * Cheap revision fingerprint for a message's parts tree.
 * Avoids `JSON.stringify(parts)` (which walks nested tool outputs) while still
 * changing when text grows, tool state flips, or part count changes.
 */
export function messagePartsRevision(message: {
  id?: string
  parts?: readonly unknown[]
}): string {
  const parts = message.parts ?? []
  const bits: string[] = [String(message.id ?? ''), String(parts.length)]
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part || typeof part !== 'object') {
      bits.push(`${i}:?`)
      continue
    }
    const rec = part as Record<string, unknown>
    const type = typeof rec.type === 'string' ? rec.type : ''
    const state = typeof rec.state === 'string' ? rec.state : ''
    if (typeof rec.text === 'string') {
      bits.push(`${i}:${type}:${state}:${contentHash(rec.text)}`)
      continue
    }
    const toolCallId =
      typeof rec.toolCallId === 'string' ? rec.toolCallId : ''
    const output = rec.output
    let outSig = ''
    if (typeof output === 'string') {
      outSig = `s${contentHash(output)}`
    } else if (output && typeof output === 'object' && !Array.isArray(output)) {
      const o = output as Record<string, unknown>
      const keys = Object.keys(o).length
      const resultType =
        typeof o.resultType === 'string' ? o.resultType : ''
      const contentLen =
        typeof o.content === 'string'
          ? o.content.length
          : typeof o.resultContent === 'string'
            ? o.resultContent.length
            : typeof o.text === 'string'
              ? o.text.length
              : 0
      outSig = `o${keys}:${resultType}:${contentLen}`
    } else if (Array.isArray(output)) {
      outSig = `a${output.length}`
    }
    const data = rec.data
    let dataSig = ''
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const d = data as Record<string, unknown>
      const content =
        typeof d.content === 'string'
          ? d.content
          : typeof d.text === 'string'
            ? d.text
            : ''
      dataSig = content
        ? `d${String(d.status ?? '')}:${contentHash(content)}`
        : `d${String(d.status ?? '')}:${Object.keys(d).length}`
    }
    bits.push(`${i}:${type}:${state}:${toolCallId}:${outSig}:${dataSig}`)
  }
  return bits.join('|')
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
