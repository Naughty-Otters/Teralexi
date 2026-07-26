import {
  classifyUnifiedDiffLine,
  parseUnifiedDiffLines,
  type UnifiedDiffLineKind,
} from '../../views/agent-chat/components/file-change/unifiedDiffLines'
import { escapeHtml } from './escape-html'

export type HighlightedDiffLine = {
  kind: UnifiedDiffLineKind
  gutter: string
  html: string
}

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

/**
 * Sync unified-diff highlighter: line-kind chrome (add/remove/context/hunk)
 * with HTML-escaped content. No language grammar / Shiki.
 */
export function highlightUnifiedDiff(diff: string): HighlightedDiffLine[] {
  const parsed = parseUnifiedDiffLines(diff)
  if (!parsed.length) return []

  return parsed.map((line) => {
    const kind = line.kind
    const gutter = gutterForKind(kind, line.text)
    const content =
      kind === 'hunk' || kind === 'meta' || kind === 'other'
        ? line.text
        : stripDiffPrefix(line.text, kind)
    return {
      kind,
      gutter,
      html: escapeHtml(content),
    }
  })
}

export function classifyLineForTest(text: string): UnifiedDiffLineKind {
  return classifyUnifiedDiffLine(text)
}
