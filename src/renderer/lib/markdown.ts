import MarkdownIt from 'markdown-it'
import {
  prepareMarkdownSource,
  unwrapOuterMarkdownFence,
} from '@shared/markdown/prepare-markdown-source'

export { prepareMarkdownSource, unwrapOuterMarkdownFence }

let sharedRenderer: MarkdownIt | null = null

/** Shared markdown-it instance for chat bubbles and previews. */
export function createRendererMarkdown(): MarkdownIt {
  return new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
  })
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
  return getRendererMarkdown().render(prepared)
}
