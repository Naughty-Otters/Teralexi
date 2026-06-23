import { describe, expect, it } from 'vitest'
import { diagramSpecV1Schema, parseDiagramSpecV1 } from './diagram-spec'

describe('diagramSpecV1Schema', () => {
  it('accepts a minimal graph spec', () => {
    const spec = parseDiagramSpecV1({
      version: 1,
      layers: [
        {
          type: 'graph',
          nodes: [{ id: 'a', label: 'A' }],
          edges: [],
        },
      ],
    })
    expect(spec.version).toBe(1)
    expect(spec.layers[0]?.type).toBe('graph')
  })

  it('rejects missing version', () => {
    expect(() =>
      diagramSpecV1Schema.parse({
        layers: [{ type: 'text', items: [{ at: { x: 0, y: 0 }, text: 'hi' }] }],
      }),
    ).toThrow()
  })

  it('rejects too many graph nodes', () => {
    const nodes = Array.from({ length: 51 }, (_, i) => ({
      id: `n${i}`,
      label: `N${i}`,
    }))
    expect(() =>
      diagramSpecV1Schema.parse({
        version: 1,
        layers: [{ type: 'graph', nodes, edges: [] }],
      }),
    ).toThrow()
  })
})
