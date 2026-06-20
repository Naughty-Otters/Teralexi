import type { ScrapedPageRecord } from './scrape-item'

export function formatWebScrapeProgress(record: ScrapedPageRecord): string {
  const title = record.title ?? record.address
  return `\n📄 Scraped: ${title}\n   Saved: ${record.outputPath}\n\n`
}

export function formatWebScrapeDigest(pages: ScrapedPageRecord[]): string {
  const lines: string[] = ['# Web scrape results', '']

  if (pages.length === 0) {
    lines.push('_No pages scraped._')
    return lines.join('\n')
  }

  for (const [index, page] of pages.entries()) {
    lines.push(`## ${index + 1}. ${page.title ?? page.address}`)
    lines.push('')
    lines.push(`- Address: ${page.address}`)
    if (page.brief) lines.push(`- Brief: ${page.brief}`)
    lines.push(`- Output: ${page.outputPath}`)
    lines.push('')
  }

  return lines.join('\n').trim()
}
