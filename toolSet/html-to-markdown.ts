import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

/**
 * HTML → markdown (Turndown) for tools that need markdown text.
 * Markdown → HTML elsewhere in the app uses `markdown-it` (see sandbox final-result, chat UI).
 */
let turndownService: TurndownService | undefined

/** Shared parser used to verify scraped markdown is syntactically parseable. */
const markdownParser = new MarkdownIt({
  html: false,
  linkify: false,
  breaks: false,
})

export function getTurndownService(): TurndownService {
  if (!turndownService) {
    turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      bulletListMarker: '-',
    })
    turndownService.remove(['script', 'style', 'noscript'])
    turndownService.use(gfm)
  }
  return turndownService
}

/** Confirms markdown-it can tokenize the string (lightweight sanity check). */
export function isParseableMarkdown(markdown: string): boolean {
  try {
    markdownParser.parse(markdown)
    return true
  } catch {
    return false
  }
}

export function htmlToMarkdown(html: string, title?: string): string {
  const converted = getTurndownService().turndown(html).trim()
  const withTitle = title?.trim()
    ? `# ${title.trim()}\n\n${converted}`
    : converted
  return withTitle.replace(/\n{3,}/g, '\n\n').trim()
}
