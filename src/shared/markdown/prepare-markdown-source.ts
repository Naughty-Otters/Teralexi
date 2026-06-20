import {
  HEAD_TAIL_OMISSION,
  truncateHeadTail,
} from '@shared/text/truncate-head-tail'

/** Matches a single outer fenced block that wraps the entire string. */
const OUTER_MARKDOWN_FENCE_RE =
  /^(`{3,})(?:[ \t]*(\w+)[ \t]*)?\r?\n([\s\S]*?)\r?\n?\1[ \t]*$/

/** Standalone fence line (opening or closing). */
const STANDALONE_FENCE_LINE_RE = /^(`{3,})(?:[ \t]*(\w+)[ \t]*)?$/gm

const PROSE_FENCE_LANGS = new Set([
  '',
  'markdown',
  'md',
  'text',
  'txt',
  'plaintext',
])

function isProseFenceLang(lang: string): boolean {
  const normalized = lang.trim().toLowerCase()
  if (PROSE_FENCE_LANGS.has(normalized)) return true
  if (normalized.startsWith('#')) return true
  return false
}

function stripLeadingProseFence(source: string): string {
  const trimmed = source.trimStart()
  if (!trimmed.startsWith('```')) return source

  const lines = trimmed.split('\n')
  const firstLine = lines[0] ?? ''
  const openMatch = firstLine.match(/^(`{3,})(?:[ \t]*(\w+)[ \t]*)?(.*)$/)
  if (!openMatch) return source

  const lang = openMatch[2] ?? ''
  const restOfLine = openMatch[3] ?? ''

  if (!isProseFenceLang(lang)) {
    return source
  }

  if (lang === '' && restOfLine.trim() && !restOfLine.trimStart().startsWith('#')) {
    return source
  }

  if (restOfLine.trim()) {
    return [restOfLine.trimStart(), ...lines.slice(1)].join('\n').trimEnd()
  }

  return lines.slice(1).join('\n').trim()
}

function stripTrailingProseFence(source: string): string {
  const trimmed = source.trimEnd()
  const match = trimmed.match(/(\r?\n)?(`{3,})[ \t]*$/)
  if (!match) return source
  return trimmed.slice(0, trimmed.length - match[0].length).trimEnd()
}

/**
 * Head/tail truncation can land inside a fence and leave orphan ``` lines in the
 * middle — markdown-it then opens a code block and shows raw ### / tables.
 */
function stripInteriorProseFencesFromTruncated(source: string): string {
  if (!source.includes(HEAD_TAIL_OMISSION.trim())) return source

  return source
    .replace(STANDALONE_FENCE_LINE_RE, (line, _ticks, lang = '') => {
      return isProseFenceLang(lang) ? '' : line
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * When the LLM wraps prose in ```markdown / ```text fences (including malformed
 * variants), markdown-it would render the block as <pre><code>. Strip prose
 * fences so headings and tables render normally.
 */
export function unwrapOuterMarkdownFence(source: string): string {
  const trimmed = source.trim()
  if (!trimmed.startsWith('```')) return source

  const symmetric = trimmed.match(OUTER_MARKDOWN_FENCE_RE)
  if (symmetric) {
    const lang = symmetric[2] ?? ''
    if (isProseFenceLang(lang)) {
      return (symmetric[3] ?? source).trim()
    }
    return source
  }

  let body = stripLeadingProseFence(trimmed)
  body = stripTrailingProseFence(body)
  return body.trim()
}

/** Normalize assistant/user markdown before markdown-it render or persistence truncation. */
export function prepareMarkdownSource(source: string): string {
  const normalized = source.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  let body = unwrapOuterMarkdownFence(normalized)
  body = stripInteriorProseFencesFromTruncated(body)
  return body
}

/** Prepare prose markdown, then apply head/tail truncation for storage/display caps. */
export function prepareAndTruncateMarkdownSource(
  source: string,
  keepChars: number,
): string {
  const prepared = prepareMarkdownSource(source)
  if (!prepared) return ''
  const truncated = truncateHeadTail(prepared, keepChars)
  return prepareMarkdownSource(truncated)
}
