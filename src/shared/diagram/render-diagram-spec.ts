import type { DiagramTheme } from './diagram-theme'
import { resolveDiagramTheme } from './diagram-theme'
import type { DiagramLayerV1, DiagramSpecV1 } from './diagram-spec'
import { parseDiagramSpecV1 } from './diagram-spec'
import { renderGraphLayer } from './layers/render-graph'
import { renderMathLayer } from './layers/render-math'
import { renderPlotLayer } from './layers/render-plot'
import { renderShapeLayer } from './layers/render-shape'
import { renderTextLayer } from './layers/render-text'
import { escapeAttr } from './svg-utils'

function renderLayer(layer: DiagramLayerV1, theme: DiagramTheme): string {
  switch (layer.type) {
    case 'graph':
      return renderGraphLayer(layer, theme).svg
    case 'plot':
      return renderPlotLayer(layer, theme)
    case 'math':
      return renderMathLayer(layer, theme)
    case 'shape':
      return renderShapeLayer(layer, theme)
    case 'text':
      return renderTextLayer(layer, theme)
    case 'group': {
      const ox = layer.at?.x ?? 0
      const oy = layer.at?.y ?? 0
      const inner = layer.layers.map((child) => renderLayer(child, theme)).join('')
      return `<g transform="translate(${ox},${oy})">${inner}</g>`
    }
    default:
      return ''
  }
}

export function renderDiagramSpecToSvg(spec: DiagramSpecV1): string {
  const theme = resolveDiagramTheme(spec.theme)
  const viewBox = spec.viewBox ?? [0, 0, 960, 540]
  const parts = spec.layers.map((layer) => renderLayer(layer, theme))
  const label = spec.title?.trim() || 'Diagram'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}" role="img" aria-label="${escapeAttr(label)}">${parts.join('')}</svg>`
}

export function renderDiagramSpecJsonToSvg(raw: unknown): string {
  const spec = parseDiagramSpecV1(raw)
  return renderDiagramSpecToSvg(spec)
}

export function tryRenderDiagramSpecJsonToSvg(
  raw: string,
): { ok: true; svg: string } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(raw) as unknown
    const svg = renderDiagramSpecJsonToSvg(parsed)
    return { ok: true, svg }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
