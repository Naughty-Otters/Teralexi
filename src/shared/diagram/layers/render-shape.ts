import type { DiagramTheme } from '../diagram-theme'
import type { ShapeItem, ShapeLayer } from '../diagram-spec'
import { escapeAttr } from '../svg-utils'

function arrowHead(
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const size = 8
  const x1 = to.x - size * Math.cos(angle - Math.PI / 6)
  const y1 = to.y - size * Math.sin(angle - Math.PI / 6)
  const x2 = to.x - size * Math.cos(angle + Math.PI / 6)
  const y2 = to.y - size * Math.sin(angle + Math.PI / 6)
  return `<polygon points="${to.x},${to.y} ${x1},${y1} ${x2},${y2}" fill="${escapeAttr(color)}"/>`
}

function renderShapeItem(item: ShapeItem, theme: DiagramTheme): string {
  switch (item.kind) {
    case 'line': {
      const stroke = item.stroke ?? theme.stroke
      const dash = item.dashed ? ' stroke-dasharray="5,4"' : ''
      return `<line x1="${item.from.x}" y1="${item.from.y}" x2="${item.to.x}" y2="${item.to.y}" stroke="${escapeAttr(stroke)}" stroke-width="1.5"${dash}/>`
    }
    case 'arrow': {
      const stroke = item.stroke ?? theme.stroke
      return `<line x1="${item.from.x}" y1="${item.from.y}" x2="${item.to.x}" y2="${item.to.y}" stroke="${escapeAttr(stroke)}" stroke-width="1.5"/>${arrowHead(item.from, item.to, stroke)}`
    }
    case 'rect': {
      const stroke = item.stroke ?? theme.stroke
      const fill = item.fill ?? 'none'
      const rx = item.rx ?? 0
      return `<rect x="${item.at.x}" y="${item.at.y}" width="${item.at.width}" height="${item.at.height}" rx="${rx}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="1.5"/>`
    }
    case 'circle': {
      const stroke = item.stroke ?? theme.stroke
      const fill = item.fill ?? 'none'
      return `<circle cx="${item.center.x}" cy="${item.center.y}" r="${item.r}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="1.5"/>`
    }
    case 'polygon': {
      const stroke = item.stroke ?? theme.stroke
      const fill = item.fill ?? 'none'
      const points = item.points.map((p) => `${p.x},${p.y}`).join(' ')
      return `<polygon points="${points}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="1.5"/>`
    }
    case 'path': {
      const stroke = item.stroke ?? theme.stroke
      const fill = item.fill ?? 'none'
      return `<path d="${escapeAttr(item.d)}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="1.5"/>`
    }
    default:
      return ''
  }
}

export function renderShapeLayer(layer: ShapeLayer, theme: DiagramTheme): string {
  const parts = layer.items.map((item) => renderShapeItem(item, theme))
  return `<g class="diagram-shape">${parts.join('')}</g>`
}
