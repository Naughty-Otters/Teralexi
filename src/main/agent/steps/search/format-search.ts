import type { SearchResultItem } from '../search-config'

export function formatSearchItemsForPrompt(items: SearchResultItem[]): string {
  if (items.length === 0) return '_No search results._'

  return items
    .map((item, index) => {
      const titleLine = item.title ? `Title: ${item.title}\n` : ''
      return [
        `${index + 1}.`,
        titleLine,
        `Address: ${item.address}`,
        `Brief: ${item.brief}`,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
}

export function formatSearchOutputMarkdown(input: {
  topic: string
  items: SearchResultItem[]
  abstraction: string
  searchEngine?: string
  searchUrl?: string
  error?: string
}): string {
  const lines: string[] = [`# Search: ${input.topic}`, '']

  if (input.searchEngine) {
    lines.push(`Engine: ${input.searchEngine}`)
    if (input.searchUrl) lines.push(`Query URL: ${input.searchUrl}`)
    lines.push('')
  }

  if (input.error && input.items.length === 0) {
    lines.push(`_Search failed: ${input.error}_`)
    lines.push('')
  }

  lines.push('- Results')
  lines.push('')

  if (input.items.length === 0) {
    lines.push('_No results found._')
  } else {
    for (const [index, item] of input.items.entries()) {
      lines.push(`${index + 1}. ${item.title ?? item.address}`)
      lines.push(`   - Address: ${item.address}`)
      lines.push(`   - Brief: ${item.brief}`)
      lines.push('')
    }
  }

  lines.push('- Total abstraction')
  lines.push('')
  lines.push(input.abstraction.trim() || '_No abstraction generated._')

  return lines.join('\n').trim()
}

export function formatSearchItemsProgress(items: SearchResultItem[]): string {
  if (items.length === 0) return '\n_No search results._\n\n'
  const lines = items.map(
    (item, index) =>
      `${index + 1}. ${item.title ?? item.address}\n   ${item.address}\n   ${item.brief}`,
  )
  return `\n${lines.join('\n\n')}\n\n`
}
