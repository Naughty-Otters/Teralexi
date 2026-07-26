import { tryRenderDiagramSpecJsonToSvg } from '@shared/diagram/render-diagram-spec'
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
 * Used by main-process PDF/HTML export (static import — asar-safe).
 * Renderer chat leaves placeholders and hydrates via {@link hydrateDiagramBlocks}.
 */
export function resolveDiagramBlocksInHtml(html: string): string {
  if (!html.includes('diagram-block--pending')) return html

  return html.replace(DIAGRAM_BLOCK_PENDING_RE, (_match, encoded: string) => {
    const raw = decodeDiagramSpec(encoded)
    const result = tryRenderDiagramSpecJsonToSvg(raw)
    if (result.ok) {
      return diagramReadyHtml(result.svg)
    }
    return diagramErrorHtml(result.error)
  })
}
