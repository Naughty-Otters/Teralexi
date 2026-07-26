import type { DiagramTheme } from './diagram-theme'
import { resolveDiagramTheme } from './diagram-theme'
import type { DiagramLayerV1, DiagramSpecV1 } from './diagram-spec'
import { parseDiagramSpecV1 } from './diagram-spec'
import { renderShapeLayer } from './layers/render-shape'
import { renderTextLayer } from './layers/render-text'
import { escapeAttr } from './svg-utils'

async function renderLayer(layer: DiagramLayerV1, theme: DiagramTheme): Promise<string> {
  switch (layer.type) {
    case 'graph': {
      const { renderGraphLayer } = await import('./layers/render-graph')
      return renderGraphLayer(layer, theme).svg
    }
    case 'plot': {
      const { renderPlotLayer } = await import('./layers/render-plot')
      return renderPlotLayer(layer, theme)
    }
    case 'math': {
      const { renderMathLayer } = await import('./layers/render-math')
      return renderMathLayer(layer, theme)
    }
    case 'shape':
      return renderShapeLayer(layer, theme)
    case 'text':
      return renderTextLayer(layer, theme)
    case 'group': {
      const ox = layer.at?.x ?? 0
      const oy = layer.at?.y ?? 0
      const inner = (
        await Promise.all(layer.layers.map((child) => renderLayer(child, theme)))
      ).join('')
      return `<g transform="translate(${ox},${oy})">${inner}</g>`
    }
    default:
      return ''
  }
}

export async function renderDiagramSpecToSvg(spec: DiagramSpecV1): Promise<string> {
  const theme = resolveDiagramTheme(spec.theme)
  const viewBox = spec.viewBox ?? [0, 0, 960, 540]
  const parts = await Promise.all(spec.layers.map((layer) => renderLayer(layer, theme)))
  const label = spec.title?.trim() || 'Diagram'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}" role="img" aria-label="${escapeAttr(label)}">${parts.join('')}</svg>`
}

export async function renderDiagramSpecJsonToSvg(raw: unknown): Promise<string> {
  const spec = parseDiagramSpecV1(raw)
  return renderDiagramSpecToSvg(spec)
}

export async function tryRenderDiagramSpecJsonToSvg(
  raw: string,
): Promise<{ ok: true; svg: string } | { ok: false; error: string }> {
  try {
    const parsed = JSON.parse(raw) as unknown
    const svg = await renderDiagramSpecJsonToSvg(parsed)
    return { ok: true, svg }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
