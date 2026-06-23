import type MarkdownIt from 'markdown-it'
import {
  createStandardMarkdownIt,
  resolveDiagramBlocksInHtml,
} from '@shared/markdown/create-markdown-it'
import {
  prepareMarkdownSource,
  unwrapOuterMarkdownFence,
} from '@shared/markdown/prepare-markdown-source'

export { prepareMarkdownSource, unwrapOuterMarkdownFence }

let sharedRenderer: MarkdownIt | null = null

/** Shared markdown-it instance for chat bubbles and previews. */
export function createRendererMarkdown(): MarkdownIt {
  return createStandardMarkdownIt()
}

export function getRendererMarkdown(): MarkdownIt {
  if (!sharedRenderer) {
    sharedRenderer = createRendererMarkdown()
  }
  return sharedRenderer
}

/**
 * Renders user/assistant markdown to HTML for `v-html`.
 * Empty input returns an empty string (caller may hide the node).
 */
export function renderMarkdownHtml(source: string): string {
  const prepared = prepareMarkdownSource(source)
  if (!prepared) return ''
  const html = getRendererMarkdown().render(prepared)
  return resolveDiagramBlocksInHtml(html)
}
