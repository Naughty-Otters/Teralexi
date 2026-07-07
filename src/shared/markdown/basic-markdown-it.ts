import type MarkdownIt from 'markdown-it'

const BASIC_MARKDOWN_IT_OPTIONS = {
  html: false,
  breaks: true,
  linkify: true,
} as const

let instance: MarkdownIt | undefined
let loadPromise: Promise<MarkdownIt> | undefined

/** Lazily loads markdown-it on first use (avoids ~600ms eager init in dev). */
export function getBasicMarkdownIt(): Promise<MarkdownIt> {
  if (instance) return Promise.resolve(instance)
  if (!loadPromise) {
    loadPromise = import('markdown-it').then(({ default: MarkdownIt }) => {
      instance = new MarkdownIt(BASIC_MARKDOWN_IT_OPTIONS)
      return instance
    })
  }
  return loadPromise
}

export async function renderBasicMarkdown(source: string): Promise<string> {
  const md = await getBasicMarkdownIt()
  return md.render(source)
}
