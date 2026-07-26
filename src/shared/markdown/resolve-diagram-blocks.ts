import { escapeAttr } from '@shared/diagram/svg-utils'

const DIAGRAM_BLOCK_PENDING_RE =
  /<div class="diagram-block diagram-block--pending" data-diagram-spec="([^"]*)"[^>]*><\/div>/g

function decodeDiagramSpec(encoded: string): string {
  return decodeURIComponent(encoded)
}

function diagramErrorHtml(message: string): string {
  return `<div class="diagram-block diagram-block--error" role="alert">${escapeAttr(message)}</div>`
}

function diagramReadyHtml(svg: string): string {
  return `<div class="diagram-block diagram-block--ready">${svg}</div>`
}

/**
 * Replace pending diagram placeholders with rendered SVG.
 * Dynamically imports the diagram renderer so katex/mathjs/dagre stay out of
 * the cold markdown path but remain in the production bundle.
 */
export async function resolveDiagramBlocksInHtml(html: string): Promise<string> {
  if (!html.includes('diagram-block--pending')) return html

  const { tryRenderDiagramSpecJsonToSvg } = await import(
    '@shared/diagram/render-diagram-spec'
  )

  const re = new RegExp(DIAGRAM_BLOCK_PENDING_RE.source, 'g')
  const parts: string[] = []
  let lastIndex = 0
  for (const match of html.matchAll(re)) {
    const index = match.index ?? 0
    parts.push(html.slice(lastIndex, index))
    const raw = decodeDiagramSpec(match[1]!)
    const result = await tryRenderDiagramSpecJsonToSvg(raw)
    parts.push(result.ok ? diagramReadyHtml(result.svg) : diagramErrorHtml(result.error))
    lastIndex = index + match[0].length
  }
  parts.push(html.slice(lastIndex))
  return parts.join('')
}
