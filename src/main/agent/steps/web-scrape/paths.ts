import { join } from 'node:path'
import { WEB_SCRAPE_STEP_ID } from '../../constants/step-ids'

/** `<sandbox>/<step_id>/output/` — per pipeline contract for web scrape artifacts. */
export function webScrapeOutputDir(sandboxRoot: string): string {
  return join(sandboxRoot, WEB_SCRAPE_STEP_ID, 'output')
}

export function webScrapeOutputPath(
  sandboxRoot: string,
  fileName: string,
): string {
  return join(webScrapeOutputDir(sandboxRoot), fileName)
}

export function slugFromUrl(url: string, index: number): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./i, '')
    const pathPart = parsed.pathname
      .replace(/[/\\]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const base = [host, pathPart].filter(Boolean).join('-') || 'page'
    const safe = base
      .slice(0, 80)
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    return `${String(index + 1).padStart(3, '0')}-${safe || 'page'}.md`
  } catch {
    return `${String(index + 1).padStart(3, '0')}-page.md`
  }
}
