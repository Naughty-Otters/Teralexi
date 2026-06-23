import dagre from 'dagre'
import type { DiagramTheme } from '../diagram-theme'
import type { GraphLayer } from '../diagram-spec'
import { escapeAttr, escapeText } from '../svg-utils'

const DEFAULT_NODE_WIDTH = 120
const DEFAULT_NODE_HEIGHT = 40
const LABEL_FONT_SIZE = 12

function estimateNodeSize(label: string | undefined): { width: number; height: number } {
  const text = label?.trim() || ' '
  const width = Math.min(220, Math.max(DEFAULT_NODE_WIDTH, text.length * 7 + 24))
  return { width, height: DEFAULT_NODE_HEIGHT }
}

function nodeShapeSvg(
  shape: GraphLayer['nodes'][number]['shape'],
  x: number,
  y: number,
  width: number,
  height: number,
  theme: DiagramTheme,
  nodeStyle?: GraphLayer['nodes'][number]['style'],
): string {
  const fill = nodeStyle?.fill ?? theme.nodeFill
  const stroke = nodeStyle?.stroke ?? theme.nodeStroke
  const cx = x + width / 2
  const cy = y + height / 2

  switch (shape) {
    case 'circle':
      return `<ellipse cx="${cx}" cy="${cy}" rx="${width / 2}" ry="${height / 2}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="1.5"/>`
    case 'diamond': {
      const points = `${cx},${y} ${x + width},${cy} ${cx},${y + height} ${x},${cy}`
      return `<polygon points="${points}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="1.5"/>`
    }
    case 'rounded':
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" ry="8" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="1.5"/>`
    case 'rect':
    default:
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="2" ry="2" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="1.5"/>`
  }
}

function edgePath(
  points: Array<{ x: number; y: number }>,
): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points
  let d = `M ${first!.x} ${first!.y}`
  for (const p of rest) {
    d += ` L ${p.x} ${p.y}`
  }
  return d
}

export function renderGraphLayer(
  layer: GraphLayer,
  theme: DiagramTheme,
): { svg: string; width: number; height: number } {
  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: layer.direction ?? 'TB',
    nodesep: 40,
    ranksep: 50,
    marginx: 20,
    marginy: 20,
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const node of layer.nodes) {
    const size = node.width && node.height
      ? { width: node.width, height: node.height }
      : estimateNodeSize(node.label)
    g.setNode(node.id, {
      ...size,
      label: node.label ?? node.id,
      shape: node.shape,
      nodeStyle: node.style,
    })
  }

  for (const edge of layer.edges) {
    g.setEdge(edge.from, edge.to, { label: edge.label, style: edge.style })
  }

  dagre.layout(g)

  const offsetX = layer.at?.x ?? 0
  const offsetY = layer.at?.y ?? 0
  const graphLabel = g.graph()
  const graphWidth = graphLabel.width ?? 0
  const graphHeight = graphLabel.height ?? 0

  const parts: string[] = [
    `<g class="diagram-graph" transform="translate(${offsetX},${offsetY})">`,
    `<defs><marker id="diagram-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${escapeAttr(theme.edge)}"/></marker></defs>`,
  ]

  for (const edge of layer.edges) {
    const edgeData = g.edge(edge.from, edge.to)
    if (!edgeData?.points) continue
    const d = edgePath(edgeData.points)
    const dash = edge.style === 'dashed' ? ' stroke-dasharray="5,4"' : ''
    parts.push(
      `<path d="${d}" fill="none" stroke="${escapeAttr(theme.edge)}" stroke-width="1.5" marker-end="url(#diagram-arrow)"${dash}/>`,
    )
    if (edge.label?.trim()) {
      const mid = edgeData.points[Math.floor(edgeData.points.length / 2)]!
      parts.push(
        `<text x="${mid.x}" y="${mid.y - 6}" text-anchor="middle" font-family="${escapeAttr(theme.fontFamily)}" font-size="${LABEL_FONT_SIZE}" fill="${escapeAttr(theme.muted)}">${escapeText(edge.label)}</text>`,
      )
    }
  }

  for (const node of layer.nodes) {
    const n = g.node(node.id)
    if (!n) continue
    const x = n.x - n.width / 2
    const y = n.y - n.height / 2
    parts.push(nodeShapeSvg(node.shape, x, y, n.width, n.height, theme, node.style))
    const label = node.label?.trim() || node.id
    parts.push(
      `<text x="${n.x}" y="${n.y + 4}" text-anchor="middle" font-family="${escapeAttr(theme.fontFamily)}" font-size="${LABEL_FONT_SIZE}" fill="${escapeAttr(theme.fill)}">${escapeText(label)}</text>`,
    )
  }

  parts.push('</g>')
  return {
    svg: parts.join(''),
    width: graphWidth + offsetX,
    height: graphHeight + offsetY,
  }
}
