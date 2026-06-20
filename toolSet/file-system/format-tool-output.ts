import { MAX_LINE_CHARS, MAX_READ_OUTPUT_BYTES } from './constants'

export function truncateLine(line: string, maxChars = MAX_LINE_CHARS): string {
  if (line.length <= maxChars) return line
  return `${line.slice(0, maxChars)}… [truncated ${line.length - maxChars} chars]`
}

export function formatNumberedLines(
  lines: string[],
  startLineNumber: number,
): { text: string; truncated: boolean; linesShown: number } {
  const parts: string[] = []
  let byteCount = 0
  let truncated = false
  let linesShown = 0

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = startLineNumber + i
    const display = truncateLine(lines[i])
    const formatted = `${lineNumber}: ${display}`
    const nextBytes = byteCount + Buffer.byteLength(formatted, 'utf-8') + 1
    if (nextBytes > MAX_READ_OUTPUT_BYTES) {
      truncated = true
      break
    }
    parts.push(formatted)
    byteCount = nextBytes
    linesShown++
  }

  return { text: parts.join('\n'), truncated, linesShown }
}

export function isLikelyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096))
  if (sample.length === 0) return false

  let nonPrintable = 0
  for (const byte of sample) {
    if (byte === 0) return true
    if (byte < 9 || (byte > 13 && byte < 32) || byte === 127) {
      nonPrintable++
    }
  }

  return nonPrintable / sample.length > 0.3
}
