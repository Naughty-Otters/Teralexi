import type { DiagramTheme } from '../diagram-theme'
import type { TextLayer } from '../diagram-spec'
import { escapeAttr, escapeText } from '../svg-utils'

export function renderTextLayer(layer: TextLayer, theme: DiagramTheme): string {
  const parts = layer.items.map((item) => {
    const anchor = item.anchor ?? 'start'
    const fontSize = item.fontSize ?? theme.fontSize
    return `<text x="${item.at.x}" y="${item.at.y}" text-anchor="${anchor}" font-family="${escapeAttr(theme.fontFamily)}" font-size="${fontSize}" fill="${escapeAttr(theme.fill)}">${escapeText(item.text)}</text>`
  })
  return `<g class="diagram-text">${parts.join('')}</g>`
}
