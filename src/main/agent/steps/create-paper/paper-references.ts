import type { CollectedPaperInputs } from './collect-sources'
import { normalizeSourceUrl } from './normalize-url'

function stripReferencesSection(markdown: string): string {
  const match = markdown.match(/\n##\s+References\b[\s\S]*$/i)
  if (!match || match.index == null) return markdown.trim()
  return markdown.slice(0, match.index).trimEnd()
}

function buildReferenceLines(inputs: CollectedPaperInputs): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  let index = 1

  const add = (url: string, title?: string) => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl) return
    const key = normalizeSourceUrl(trimmedUrl)
    if (seen.has(key)) return
    seen.add(key)
    const label = title?.trim() || trimmedUrl
    lines.push(`${index}. **${label}** — ${trimmedUrl}`)
    index += 1
  }

  for (const source of inputs.sources) {
    add(source.address, source.title)
  }

  for (const item of inputs.searchItems) {
    add(item.address, item.title)
  }

  return lines
}

/** Ensures the report ends with a numbered reference list of all searched/scraped URLs. */
export function appendPaperReferences(
  paperMarkdown: string,
  inputs: CollectedPaperInputs,
): string {
  const lines = buildReferenceLines(inputs)
  if (lines.length === 0) return paperMarkdown.trim()

  const body = stripReferencesSection(paperMarkdown)
  return `${body}\n\n## References\n\n${lines.join('\n')}\n`
}
