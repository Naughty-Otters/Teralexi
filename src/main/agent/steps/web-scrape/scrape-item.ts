import { mkdir, writeFile } from 'node:fs/promises'
import { scrapePage } from '@toolSet/web'
import type { SearchResultItem } from '../search-config'
import { slugFromUrl, webScrapeOutputDir, webScrapeOutputPath } from './paths'

export type ScrapedPageRecord = {
  address: string
  title?: string
  brief?: string
  outputPath: string
  markdown: string
}

export async function scrapeSearchItemToMarkdownFile(input: {
  item: SearchResultItem
  index: number
  sandboxRoot: string
  maxChars?: number
}): Promise<ScrapedPageRecord | null> {
  const { item, index, sandboxRoot, maxChars } = input
  const url = item.address.trim()
  if (!url) return null

  try {
    const page = await scrapePage(url, maxChars != null ? { maxChars } : undefined)
    const title = page.title?.trim() || item.title?.trim()
    const markdown = page.markdown
    const fileName = slugFromUrl(url, index)
    const outputDir = webScrapeOutputDir(sandboxRoot)
    await mkdir(outputDir, { recursive: true })
    const outputPath = webScrapeOutputPath(sandboxRoot, fileName)
    await writeFile(outputPath, markdown, 'utf8')

    return {
      address: url,
      title,
      brief: item.brief?.trim() || undefined,
      outputPath,
      markdown,
    }
  } catch {
    return null
  }
}
