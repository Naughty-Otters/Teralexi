import { create, all } from 'mathjs'
import type { DiagramTheme } from '../diagram-theme'
import type { PlotLayer, PlotSeries } from '../diagram-spec'
import { MAX_PLOT_SAMPLES } from '../diagram-spec'
import { escapeAttr, escapeText } from '../svg-utils'

const math = create(all)

type PlotCurve = {
  fn: string
  color: string
  label?: string
}

function sampleCurve(
  fn: string,
  domain: [number, number],
  samples: number,
): Array<{ x: number; y: number }> {
  const compiled = math.compile(fn)
  const [xMin, xMax] = domain
  const step = (xMax - xMin) / Math.max(1, samples - 1)
  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i < samples; i += 1) {
    const x = xMin + step * i
    try {
      const y = compiled.evaluate({ x }) as number
      if (typeof y === 'number' && Number.isFinite(y)) {
        points.push({ x, y })
      }
    } catch {
      // skip invalid sample
    }
  }
  return points
}

function computeRange(
  curves: PlotCurve[],
  domain: [number, number],
  samples: number,
  explicit?: [number, number],
): [number, number] {
  if (explicit) return explicit
  let yMin = Infinity
  let yMax = -Infinity
  for (const curve of curves) {
    for (const p of sampleCurve(curve.fn, domain, samples)) {
      yMin = Math.min(yMin, p.y)
      yMax = Math.max(yMax, p.y)
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    return [-1, 1]
  }
  if (yMin === yMax) {
    yMin -= 1
    yMax += 1
  }
  const pad = (yMax - yMin) * 0.08
  return [yMin - pad, yMax + pad]
}

function toPath(
  points: Array<{ x: number; y: number }>,
  mapX: (x: number) => number,
  mapY: (y: number) => number,
): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points
  let d = `M ${mapX(first!.x).toFixed(2)} ${mapY(first!.y).toFixed(2)}`
  for (const p of rest) {
    d += ` L ${mapX(p.x).toFixed(2)} ${mapY(p.y).toFixed(2)}`
  }
  return d
}

export function renderPlotLayer(layer: PlotLayer, theme: DiagramTheme): string {
  const { at } = layer
  const samples = Math.min(layer.samples ?? 200, MAX_PLOT_SAMPLES)
  const curves: PlotCurve[] = [
    {
      fn: layer.fn,
      color: layer.color ?? theme.accent,
      label: undefined,
    },
    ...(layer.series ?? []).map((s: PlotSeries) => ({
      fn: s.fn,
      color: s.color ?? theme.muted,
      label: s.label,
    })),
  ]
  const yRange = computeRange(curves, layer.domain, samples, layer.range)
  const [xMin, xMax] = layer.domain
  const [yMin, yMax] = yRange
  const pad = 28
  const plotX = at.x + pad
  const plotY = at.y + pad
  const plotW = at.width - pad * 2
  const plotH = at.height - pad * 2

  const mapX = (x: number) => plotX + ((x - xMin) / (xMax - xMin)) * plotW
  const mapY = (y: number) => plotY + plotH - ((y - yMin) / (yMax - yMin)) * plotH

  const parts: string[] = [
    `<g class="diagram-plot">`,
    `<rect x="${at.x}" y="${at.y}" width="${at.width}" height="${at.height}" fill="${escapeAttr(theme.background)}" stroke="${escapeAttr(theme.grid)}" stroke-width="1" rx="4"/>`,
  ]

  if (layer.showGrid !== false) {
    const gridLines = 5
    for (let i = 0; i <= gridLines; i += 1) {
      const t = i / gridLines
      const gx = plotX + plotW * t
      const gy = plotY + plotH * t
      parts.push(
        `<line x1="${gx}" y1="${plotY}" x2="${gx}" y2="${plotY + plotH}" stroke="${escapeAttr(theme.grid)}" stroke-width="1"/>`,
        `<line x1="${plotX}" y1="${gy}" x2="${plotX + plotW}" y2="${gy}" stroke="${escapeAttr(theme.grid)}" stroke-width="1"/>`,
      )
    }
  }

  if (layer.showAxes !== false) {
    if (yMin <= 0 && yMax >= 0) {
      parts.push(
        `<line x1="${plotX}" y1="${mapY(0)}" x2="${plotX + plotW}" y2="${mapY(0)}" stroke="${escapeAttr(theme.stroke)}" stroke-width="1.5"/>`,
      )
    }
    if (xMin <= 0 && xMax >= 0) {
      parts.push(
        `<line x1="${mapX(0)}" y1="${plotY}" x2="${mapX(0)}" y2="${plotY + plotH}" stroke="${escapeAttr(theme.stroke)}" stroke-width="1.5"/>`,
      )
    }
  }

  for (const curve of curves) {
    const points = sampleCurve(curve.fn, layer.domain, samples)
    const d = toPath(points, mapX, mapY)
    if (d) {
      parts.push(
        `<path d="${d}" fill="none" stroke="${escapeAttr(curve.color)}" stroke-width="2"/>`,
      )
    }
  }

  if (layer.xLabel?.trim()) {
    parts.push(
      `<text x="${plotX + plotW / 2}" y="${at.y + at.height - 6}" text-anchor="middle" font-family="${escapeAttr(theme.fontFamily)}" font-size="${theme.fontSize}" fill="${escapeAttr(theme.muted)}">${escapeText(layer.xLabel)}</text>`,
    )
  }
  if (layer.yLabel?.trim()) {
    parts.push(
      `<text x="${at.x + 8}" y="${plotY + plotH / 2}" text-anchor="middle" font-family="${escapeAttr(theme.fontFamily)}" font-size="${theme.fontSize}" fill="${escapeAttr(theme.muted)}" transform="rotate(-90 ${at.x + 8} ${plotY + plotH / 2})">${escapeText(layer.yLabel)}</text>`,
    )
  }

  parts.push('</g>')
  return parts.join('')
}
