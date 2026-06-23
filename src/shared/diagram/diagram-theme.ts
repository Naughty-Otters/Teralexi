export type DiagramTheme = {
  fontFamily: string
  fontSize: number
  stroke: string
  fill: string
  muted: string
  accent: string
  background: string
  grid: string
  edge: string
  nodeFill: string
  nodeStroke: string
}

export type DiagramThemeInput = Partial<DiagramTheme>

export const DEFAULT_DIAGRAM_THEME: DiagramTheme = {
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
  fontSize: 13,
  stroke: '#334155',
  fill: '#0f172a',
  muted: '#64748b',
  accent: '#2563eb',
  background: 'transparent',
  grid: '#e2e8f0',
  edge: '#64748b',
  nodeFill: '#f8fafc',
  nodeStroke: '#94a3b8',
}

export function resolveDiagramTheme(
  input?: DiagramThemeInput,
): DiagramTheme {
  return { ...DEFAULT_DIAGRAM_THEME, ...input }
}
