import type MarkdownIt from 'markdown-it'
import { tryRenderDiagramSpecJsonToSvg } from '@shared/diagram/render-diagram-spec'
import { escapeAttr } from '@shared/diagram/svg-utils'
import { applySandboxPreviewLinkPlugin } from './sandbox-preview-links'

let standardInstance: MarkdownIt | undefined
let standardLoadPromise: Promise<MarkdownIt> | undefined

const DIAGRAM_BLOCK_PENDING_RE =
  /<div class="diagram-block diagram-block--pending" data-diagram-spec="([^"]*)"[^>]*><\/div>/g

function encodeDiagramSpec(raw: string): string {
  return encodeURIComponent(raw.trim())
}

function decodeDiagramSpec(encoded: string): string {
  return decodeURIComponent(encoded)
}

function diagramPlaceholderHtml(raw: string): string {
  const encoded = encodeDiagramSpec(raw)
  return `<div class="diagram-block diagram-block--pending" data-diagram-spec="${escapeAttr(encoded)}"></div>`
}

function diagramErrorHtml(message: string): string {
  return `<div class="diagram-block diagram-block--error" role="alert">${escapeAttr(message)}</div>`
}

function diagramReadyHtml(svg: string): string {
  return `<div class="diagram-block diagram-block--ready">${svg}</div>`
}

/** Apply markdown-it plugin: ```diagram fences become placeholder divs. */
export function applyDiagramFencePlugin(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence!
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const lang = token.info.trim().split(/\s+/)[0]?.toLowerCase()
    if (lang === 'diagram') {
      const raw = token.content.trim()
      if (!raw) {
        return diagramErrorHtml('Empty diagram block')
      }
      try {
        JSON.parse(raw)
      } catch {
        return defaultFence(tokens, idx, options, env, self)
      }
      return diagramPlaceholderHtml(raw)
    }
    return defaultFence(tokens, idx, options, env, self)
  }
}

/** Replace pending diagram placeholders with rendered SVG (or error div). */
export function resolveDiagramBlocksInHtml(html: string): string {
  return html.replace(DIAGRAM_BLOCK_PENDING_RE, (_match, encoded: string) => {
    const raw = decodeDiagramSpec(encoded)
    const result = tryRenderDiagramSpecJsonToSvg(raw)
    if (result.ok) {
      return diagramReadyHtml(result.svg)
    }
    return diagramErrorHtml(result.error)
  })
}

export function configureStandardMarkdownIt(
  MarkdownItCtor: typeof import('markdown-it').default,
): MarkdownIt {
  const md = new MarkdownItCtor({
    html: false,
    breaks: true,
    linkify: true,
  })
  const defaultValidateLink = md.validateLink.bind(md)
  md.validateLink = (url: string) => {
    if (url.trim().toLowerCase().startsWith('file://')) return true
    return defaultValidateLink(url)
  }
  applyDiagramFencePlugin(md)
  applySandboxPreviewLinkPlugin(md)
  return md
}

/** Lazily loads markdown-it + standard plugins on first use. */
export function getStandardMarkdownIt(): Promise<MarkdownIt> {
  if (standardInstance) return Promise.resolve(standardInstance)
  if (!standardLoadPromise) {
    standardLoadPromise = import('markdown-it').then(({ default: MarkdownIt }) => {
      standardInstance = configureStandardMarkdownIt(MarkdownIt)
      return standardInstance
    })
  }
  return standardLoadPromise
}

/** @deprecated Use {@link getStandardMarkdownIt} in renderer or {@link createStandardMarkdownItEager} in main. */
export function createStandardMarkdownIt(): MarkdownIt {
  throw new Error(
    'createStandardMarkdownIt() is async-only in renderer; use getStandardMarkdownIt() or createStandardMarkdownItEager()',
  )
}
