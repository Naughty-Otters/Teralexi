import type MarkdownIt from 'markdown-it'
import { getStandardMarkdownIt } from '@shared/markdown/create-markdown-it'
import {
  prepareMarkdownSource,
  unwrapOuterMarkdownFence,
} from '@shared/markdown/prepare-markdown-source'
import { shallowRef } from 'vue'

export { prepareMarkdownSource, unwrapOuterMarkdownFence }

export const rendererMarkdown = shallowRef<MarkdownIt | null>(null)

let loadStarted = false

function ensureRendererMarkdownLoad(): void {
  if (loadStarted) return
  loadStarted = true
  void getStandardMarkdownIt().then((md) => {
    rendererMarkdown.value = md
  })
}

ensureRendererMarkdownLoad()

function escapePlainMarkdownFallback(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

/** Shared markdown-it instance for chat bubbles and previews. */
export async function createRendererMarkdown(): Promise<MarkdownIt> {
  return getStandardMarkdownIt()
}

export function getRendererMarkdown(): MarkdownIt | null {
  return rendererMarkdown.value
}

/**
 * Renders user/assistant markdown to HTML for `v-html`.
 * Diagram fences stay as pending placeholders; call `hydrateDiagramBlocks`
 * after mount to resolve them (lazy katex/mathjs/dagre).
 * Empty input returns an empty string (caller may hide the node).
 */
export function renderMarkdownHtml(source: string): string {
  ensureRendererMarkdownLoad()
  const prepared = prepareMarkdownSource(source)
  if (!prepared) return ''
  const md = rendererMarkdown.value
  if (!md) return `<p>${escapePlainMarkdownFallback(prepared)}</p>`
  return md.render(prepared)
}
