import { describe, expect, it } from 'vitest'
import { DEFAULT_DIAGRAM_THEME } from '../diagram-theme'
import type { ShapeLayer } from '../diagram-spec'
import { renderShapeLayer } from './render-shape'

describe('renderShapeLayer', () => {
  it('wraps rendered items in a shape group', () => {
    const layer: ShapeLayer = {
      type: 'shape',
      items: [
        {
          kind: 'line',
          from: { x: 0, y: 0 },
          to: { x: 10, y: 10 },
        },
      ],
    }

    const svg = renderShapeLayer(layer, DEFAULT_DIAGRAM_THEME)

    expect(svg).toMatch(/^<g class="diagram-shape">.*<\/g>$/)
    expect(svg).toContain('<line x1="0" y1="0" x2="10" y2="10"')
    expect(svg).toContain(`stroke="${DEFAULT_DIAGRAM_THEME.stroke}"`)
  })

  it('renders dashed lines and arrows', () => {
    const layer: ShapeLayer = {
      type: 'shape',
      items: [
        {
          kind: 'line',
          from: { x: 1, y: 2 },
          to: { x: 3, y: 4 },
          dashed: true,
          stroke: '#ff0000',
        },
        {
          kind: 'arrow',
          from: { x: 0, y: 0 },
          to: { x: 20, y: 0 },
          stroke: '#00ff00',
        },
      ],
    }

    const svg = renderShapeLayer(layer, DEFAULT_DIAGRAM_THEME)

    expect(svg).toContain('stroke-dasharray="5,4"')
    expect(svg).toContain('stroke="#ff0000"')
    expect(svg).toContain('stroke="#00ff00"')
    expect(svg).toContain('<polygon points=')
  })

  it('renders rect, circle, polygon, and path shapes', () => {
    const layer: ShapeLayer = {
      type: 'shape',
      items: [
        {
          kind: 'rect',
          at: { x: 5, y: 6, width: 40, height: 20 },
          rx: 4,
          fill: '#111111',
          stroke: '#222222',
        },
        {
          kind: 'circle',
          center: { x: 10, y: 10 },
          r: 6,
          fill: '#333333',
        },
        {
          kind: 'polygon',
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: 8 },
          ],
          stroke: '#444444',
        },
        {
          kind: 'path',
          d: 'M0 0 L10 10',
          fill: 'none',
          stroke: '#555555',
        },
      ],
    }

    const svg = renderShapeLayer(layer, DEFAULT_DIAGRAM_THEME)

    expect(svg).toContain('<rect x="5" y="6" width="40" height="20" rx="4"')
    expect(svg).toContain('fill="#111111"')
    expect(svg).toContain('<circle cx="10" cy="10" r="6"')
    expect(svg).toContain('<polygon points="0,0 10,0 5,8"')
    expect(svg).toContain('<path d="M0 0 L10 10"')
  })
})
