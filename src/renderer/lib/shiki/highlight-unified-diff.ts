import {
  classifyUnifiedDiffLine,
  parseUnifiedDiffLines,
  type UnifiedDiffLineKind,
} from '../../views/agent-chat/components/file-change/unifiedDiffLines'
import { languageFromFilePath } from './guess-language'
import { codeToHtml, escapeHtml } from './highlighter'

export type HighlightedDiffLine = {
  kind: UnifiedDiffLineKind
  gutter: string
  html: string
}

const MAX_SHIKI_CONTENT_LINES = 400

function gutterForKind(kind: UnifiedDiffLineKind, text: string): string {
  if (kind === 'add') return '+'
  if (kind === 'remove') return '−'
  if (kind === 'context' && text.startsWith(' ')) return ' '
  return ' '
}

function stripDiffPrefix(text: string, kind: UnifiedDiffLineKind): string {
  if (kind === 'add' || kind === 'remove') return text.slice(1)
  if (kind === 'context' && text.startsWith(' ')) return text.slice(1)
  return text
}

export async function highlightUnifiedDiff(
  diff: string,
  options?: {
    filePath?: string
    isDark?: boolean
  },
): Promise<HighlightedDiffLine[]> {
  const parsed = parseUnifiedDiffLines(diff)
  if (!parsed.length) return []

  const isDark = options?.isDark ?? true
  const contentLang = languageFromFilePath(options?.filePath)
  let contentLineBudget = MAX_SHIKI_CONTENT_LINES

  const lines: HighlightedDiffLine[] = []

  for (const line of parsed) {
    const kind = line.kind
    const gutter = gutterForKind(kind, line.text)

    if (kind === 'hunk' || kind === 'meta' || kind === 'other') {
      lines.push({
        kind,
        gutter,
        html: escapeHtml(line.text),
      })
      continue
    }

    const content = stripDiffPrefix(line.text, kind)
    if (!content.trim() || contentLineBudget <= 0) {
      lines.push({
        kind,
        gutter,
        html: escapeHtml(line.text),
      })
      continue
    }

    contentLineBudget -= 1
    const inner = await codeToHtml(content, contentLang, isDark)
    const innerHtml = extractShikiInnerHtml(inner)
    lines.push({
      kind,
      gutter,
      html: innerHtml,
    })
  }

  return lines
}

/** Shiki returns `<pre class="shiki">…<code>…</code></pre>` — keep inner code markup only. */
export function extractShikiInnerHtml(fragment: string): string {
  const codeMatch = fragment.match(/<code[^>]*>([\s\S]*)<\/code>/i)
  if (codeMatch?.[1]) return codeMatch[1]
  return fragment
}

export function classifyLineForTest(text: string): UnifiedDiffLineKind {
  return classifyUnifiedDiffLine(text)
}
