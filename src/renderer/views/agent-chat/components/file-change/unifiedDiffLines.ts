export type UnifiedDiffLineKind =
  | 'add'
  | 'remove'
  | 'context'
  | 'hunk'
  | 'meta'
  | 'other'

export type UnifiedDiffLine = {
  text: string
  kind: UnifiedDiffLineKind
}

export function classifyUnifiedDiffLine(line: string): UnifiedDiffLineKind {
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('Index: ')) {
    return 'meta'
  }
  if (line.startsWith('===')) return 'meta'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'remove'
  if (line.startsWith(' ')) return 'context'
  return 'other'
}

export function parseUnifiedDiffLines(diff: string): UnifiedDiffLine[] {
  if (!diff.trim()) return []
  return diff.split('\n').map((text) => ({
    text,
    kind: classifyUnifiedDiffLine(text),
  }))
}

type DiffLineKindLike = { kind: string }

/**
 * Brief peek: start at the first +/- change with one unchanged context line
 * before it (when present). Skips Index/---/+++ and @@ headers.
 */
export function selectBriefDiffLines<T extends DiffLineKindLike>(
  lines: readonly T[],
  maxLines: number,
): T[] {
  if (maxLines <= 0) return []
  const code = lines.filter(
    (line) =>
      line.kind === 'add' || line.kind === 'remove' || line.kind === 'context',
  )
  const firstChange = code.findIndex(
    (line) => line.kind === 'add' || line.kind === 'remove',
  )
  if (firstChange < 0) return code.slice(0, maxLines)

  let start = firstChange
  if (firstChange > 0 && code[firstChange - 1]?.kind === 'context') {
    start = firstChange - 1
  }
  return code.slice(start, start + maxLines)
}

/** How many brief-relevant lines exist after focusing on the first change. */
export function countBriefDiffLines(lines: readonly DiffLineKindLike[]): number {
  const code = lines.filter(
    (line) =>
      line.kind === 'add' || line.kind === 'remove' || line.kind === 'context',
  )
  const firstChange = code.findIndex(
    (line) => line.kind === 'add' || line.kind === 'remove',
  )
  if (firstChange < 0) return code.length
  let start = firstChange
  if (firstChange > 0 && code[firstChange - 1]?.kind === 'context') {
    start = firstChange - 1
  }
  return Math.max(0, code.length - start)
}
