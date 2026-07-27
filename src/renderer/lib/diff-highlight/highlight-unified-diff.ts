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
  /** 1-based line in the old file; null when not applicable. */
  oldLine: number | null
  /** 1-based line in the new file; null when not applicable. */
  newLine: number | null
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

/** Parse `@@ -l,s +l,s @@` / `@@ -l +l @@` into starting old/new line numbers. */
export function parseHunkLineStarts(
  hunkHeader: string,
): { oldStart: number; newStart: number } | null {
  const match = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/.exec(
    hunkHeader.replace(/\r$/, ''),
  )
  if (!match) return null
  return {
    oldStart: Number.parseInt(match[1]!, 10),
    newStart: Number.parseInt(match[2]!, 10),
  }
}

function isCodeLine(kind: UnifiedDiffLineKind): boolean {
  return kind === 'add' || kind === 'remove' || kind === 'context'
}

/**
 * Sync unified-diff highlighter: line-kind chrome (add/remove/context/hunk)
 * with HTML-escaped content and old/new line numbers. No language grammar / Shiki.
 *
 * When hunk headers are missing (legacy stripped diffs), falls back to sequential
 * 1-based numbers so the gutter still shows something useful.
 */
export function highlightUnifiedDiff(diff: string): HighlightedDiffLine[] {
  const parsed = parseUnifiedDiffLines(diff)
  if (!parsed.length) return []

  let oldLine = 0
  let newLine = 0
  let inHunk = false

  return parsed.map((line) => {
    const kind = line.kind
    const gutter = gutterForKind(kind, line.text)
    const content =
      kind === 'hunk' || kind === 'meta' || kind === 'other'
        ? line.text
        : stripDiffPrefix(line.text, kind)

    let oldNum: number | null = null
    let newNum: number | null = null

    if (kind === 'hunk') {
      const starts = parseHunkLineStarts(line.text)
      if (starts) {
        oldLine = starts.oldStart
        newLine = starts.newStart
        inHunk = true
      }
    } else if (isCodeLine(kind)) {
      if (!inHunk) {
        // Legacy / headerless diff body — invent a 1-based sequence.
        inHunk = true
        oldLine = 1
        newLine = 1
      }
      if (kind === 'remove') {
        oldNum = oldLine
        oldLine += 1
      } else if (kind === 'add') {
        newNum = newLine
        newLine += 1
      } else {
        oldNum = oldLine
        newNum = newLine
        oldLine += 1
        newLine += 1
      }
    }

    return {
      kind,
      gutter,
      html: escapeHtml(content),
      oldLine: oldNum,
      newLine: newNum,
    }
  })
}

export function classifyLineForTest(text: string): UnifiedDiffLineKind {
  return classifyUnifiedDiffLine(text)
}
