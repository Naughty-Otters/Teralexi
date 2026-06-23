import { describe, expect, it } from 'vitest'
import { renderDiagramSpecToSvg } from './render-diagram-spec'
import type { DiagramSpecV1 } from './diagram-spec'

describe('renderDiagramSpecToSvg', () => {
  it('renders a graph layer as SVG', () => {
    const spec: DiagramSpecV1 = {
      version: 1,
      viewBox: [0, 0, 400, 200],
      layers: [
        {
          type: 'graph',
          direction: 'LR',
          nodes: [
            { id: 'a', label: 'Client', shape: 'rounded' },
            { id: 'b', label: 'API', shape: 'rect' },
          ],
          edges: [{ from: 'a', to: 'b', label: 'HTTPS' }],
        },
      ],
    }
    const svg = renderDiagramSpecToSvg(spec)
    expect(svg).toContain('<svg')
    expect(svg).toContain('Client')
    expect(svg).toContain('API')
    expect(svg).toContain('HTTPS')
  })

  it('renders a plot layer as SVG path', () => {
    const spec: DiagramSpecV1 = {
      version: 1,
      viewBox: [0, 0, 480, 280],
      layers: [
        {
          type: 'plot',
          at: { x: 20, y: 20, width: 440, height: 240 },
          fn: 'sin(x)',
          domain: [-6.28, 6.28],
          range: [-1.2, 1.2],
          showGrid: true,
          showAxes: true,
        },
      ],
    }
    const svg = renderDiagramSpecToSvg(spec)
    expect(svg).toContain('<path')
    expect(svg).toContain('diagram-plot')
  })

  it('renders combined graph and plot layers', () => {
    const spec: DiagramSpecV1 = {
      version: 1,
      viewBox: [0, 0, 960, 560],
      layers: [
        {
          type: 'math',
          latex: 'y = \\sin(x)',
          at: { x: 40, y: 36 },
          displayMode: false,
        },
        {
          type: 'plot',
          at: { x: 40, y: 60, width: 420, height: 240 },
          fn: 'sin(x)',
          domain: [-6.28, 6.28],
        },
        {
          type: 'graph',
          at: { x: 500, y: 60 },
          direction: 'TB',
          nodes: [
            { id: 'md', label: 'Markdown' },
            { id: 'svg', label: 'SVG' },
          ],
          edges: [{ from: 'md', to: 'svg' }],
        },
      ],
    }
    const svg = renderDiagramSpecToSvg(spec)
    expect(svg).toContain('diagram-plot')
    expect(svg).toContain('diagram-graph')
    expect(svg).toContain('foreignObject')
  })
})
