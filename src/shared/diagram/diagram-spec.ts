import { z } from 'zod'

export const MAX_GRAPH_NODES = 50
export const MAX_PLOT_SAMPLES = 500

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
})

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
})

const nodeStyleSchema = z.object({
  fill: z.string().optional(),
  stroke: z.string().optional(),
})

const graphNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  latex: z.boolean().optional(),
  shape: z.enum(['rect', 'rounded', 'circle', 'diamond']).optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  style: nodeStyleSchema.optional(),
})

const graphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  latex: z.boolean().optional(),
  style: z.enum(['solid', 'dashed']).optional(),
})

const graphLayerSchema = z.object({
  type: z.literal('graph'),
  id: z.string().optional(),
  layout: z.literal('dagre').optional(),
  direction: z.enum(['TB', 'BT', 'LR', 'RL']).optional(),
  at: pointSchema.optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  nodes: z.array(graphNodeSchema).min(1).max(MAX_GRAPH_NODES),
  edges: z.array(graphEdgeSchema),
})

const plotSeriesSchema = z.object({
  fn: z.string().min(1),
  color: z.string().optional(),
  label: z.string().optional(),
})

const plotLayerSchema = z.object({
  type: z.literal('plot'),
  id: z.string().optional(),
  at: rectSchema,
  fn: z.string().min(1),
  domain: z.tuple([z.number(), z.number()]),
  range: z.tuple([z.number(), z.number()]).optional(),
  samples: z.number().int().positive().max(MAX_PLOT_SAMPLES).optional(),
  showGrid: z.boolean().optional(),
  showAxes: z.boolean().optional(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  color: z.string().optional(),
  series: z.array(plotSeriesSchema).optional(),
})

const mathLayerSchema = z.object({
  type: z.literal('math'),
  latex: z.string().min(1),
  at: pointSchema,
  displayMode: z.boolean().optional(),
  fontSize: z.number().positive().optional(),
})

const shapeItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('line'),
    from: pointSchema,
    to: pointSchema,
    stroke: z.string().optional(),
    dashed: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('arrow'),
    from: pointSchema,
    to: pointSchema,
    stroke: z.string().optional(),
  }),
  z.object({
    kind: z.literal('rect'),
    at: rectSchema,
    rx: z.number().nonnegative().optional(),
    stroke: z.string().optional(),
    fill: z.string().optional(),
  }),
  z.object({
    kind: z.literal('circle'),
    center: pointSchema,
    r: z.number().positive(),
    stroke: z.string().optional(),
    fill: z.string().optional(),
  }),
  z.object({
    kind: z.literal('polygon'),
    points: z.array(pointSchema).min(3),
    stroke: z.string().optional(),
    fill: z.string().optional(),
  }),
  z.object({
    kind: z.literal('path'),
    d: z.string().min(1),
    stroke: z.string().optional(),
    fill: z.string().optional(),
  }),
])

const shapeLayerSchema = z.object({
  type: z.literal('shape'),
  items: z.array(shapeItemSchema).min(1),
})

const textLayerSchema = z.object({
  type: z.literal('text'),
  items: z
    .array(
      z.object({
        at: pointSchema,
        text: z.string(),
        anchor: z.enum(['start', 'middle', 'end']).optional(),
        fontSize: z.number().positive().optional(),
      }),
    )
    .min(1),
})

const diagramLayerSchema: z.ZodType<DiagramLayerV1> = z.lazy(() =>
  z.discriminatedUnion('type', [
    graphLayerSchema,
    plotLayerSchema,
    mathLayerSchema,
    shapeLayerSchema,
    textLayerSchema,
    z.object({
      type: z.literal('group'),
      at: pointSchema.optional(),
      layers: z.array(diagramLayerSchema).min(1),
    }),
  ]),
)

export const diagramSpecV1Schema = z.object({
  version: z.literal(1),
  viewBox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  title: z.string().optional(),
  theme: z
    .object({
      fontFamily: z.string().optional(),
      fontSize: z.number().positive().optional(),
      stroke: z.string().optional(),
      fill: z.string().optional(),
      muted: z.string().optional(),
      accent: z.string().optional(),
    })
    .optional(),
  layers: z.array(diagramLayerSchema).min(1),
})

export type Point = z.infer<typeof pointSchema>
export type Rect = z.infer<typeof rectSchema>
export type GraphNode = z.infer<typeof graphNodeSchema>
export type GraphEdge = z.infer<typeof graphEdgeSchema>
export type GraphLayer = z.infer<typeof graphLayerSchema>
export type PlotLayer = z.infer<typeof plotLayerSchema>
export type PlotSeries = z.infer<typeof plotSeriesSchema>
export type MathLayer = z.infer<typeof mathLayerSchema>
export type ShapeItem = z.infer<typeof shapeItemSchema>
export type ShapeLayer = z.infer<typeof shapeLayerSchema>
export type TextLayer = z.infer<typeof textLayerSchema>
export type GroupLayer = {
  type: 'group'
  at?: Point
  layers: DiagramLayerV1[]
}

export type DiagramLayerV1 =
  | GraphLayer
  | PlotLayer
  | MathLayer
  | ShapeLayer
  | TextLayer
  | GroupLayer

export type DiagramSpecV1 = z.infer<typeof diagramSpecV1Schema>

export function parseDiagramSpecV1(raw: unknown): DiagramSpecV1 {
  return diagramSpecV1Schema.parse(raw)
}
