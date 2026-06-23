import katex from 'katex'
import type { DiagramTheme } from '../diagram-theme'
import type { MathLayer } from '../diagram-spec'
import { escapeAttr } from '../svg-utils'

export function renderMathLayer(layer: MathLayer, theme: DiagramTheme): string {
  const displayMode = layer.displayMode !== false
  const fontSize = layer.fontSize ?? (displayMode ? 18 : 14)
  let html: string
  try {
    html = katex.renderToString(layer.latex, {
      displayMode,
      throwOnError: true,
      output: 'html',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid LaTeX'
    return `<text x="${layer.at.x}" y="${layer.at.y}" fill="red" font-size="12">${escapeAttr(message)}</text>`
  }

  const width = displayMode ? 400 : 240
  const height = displayMode ? 48 : 28
  return `<foreignObject x="${layer.at.x}" y="${layer.at.y - (displayMode ? 8 : 16)}" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:${escapeAttr(theme.fontFamily)};font-size:${fontSize}px;color:${escapeAttr(theme.fill)}">${html}</div></foreignObject>`
}
