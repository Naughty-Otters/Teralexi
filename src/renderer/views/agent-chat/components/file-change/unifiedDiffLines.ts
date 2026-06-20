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
