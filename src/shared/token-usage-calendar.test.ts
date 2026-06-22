import { describe, expect, it } from 'vitest'
import {
  buildRollingDayHeatmap,
  buildYearHeatmap,
  lastNDayKeys,
  utcTodayKey,
  utcYear,
  yearDayKeys,
} from './token-usage-calendar'

describe('token-usage-calendar', () => {
  it('lastNDayKeys returns N days ending today', () => {
    const days = lastNDayKeys(30)
    expect(days).toHaveLength(30)
    expect(days[days.length - 1]).toBe(utcTodayKey())
  })

  it('yearDayKeys covers Jan 1 through Dec 31', () => {
    const days = yearDayKeys(2026)
    expect(days[0]).toBe('2026-01-01')
    expect(days[days.length - 1]).toBe('2026-12-31')
    expect(days).toHaveLength(365)
  })

  it('builds a rolling GitHub-style grid for 30 days', () => {
    const dates = Array.from({ length: 30 }, (_, i) => {
      const d = new Date('2026-06-01T00:00:00.000Z')
      d.setUTCDate(d.getUTCDate() + i)
      return d.toISOString().slice(0, 10)
    })

    const heatmap = buildRollingDayHeatmap({
      dates,
      tokensByDate: new Map([['2026-06-07', 42]]),
    })

    expect(heatmap.rows).toHaveLength(7)
    expect(heatmap.rows[0]?.label).toBe('Sun')
    expect(heatmap.rows[3]?.showLabel).toBe(true)
    expect(heatmap.weekCount).toBeGreaterThanOrEqual(4)

    const sundayCell = heatmap.rows[0]?.cells.find((cell) => cell.date === '2026-06-07')
    expect(sundayCell?.totalTokens).toBe(42)
  })

  it('marks zero-usage days as day cells, not padding', () => {
    const heatmap = buildRollingDayHeatmap({
      dates: ['2026-06-04', '2026-06-05'],
      tokensByDate: new Map(),
    })

    const dayCells = heatmap.rows.flatMap((row) =>
      row.cells.filter((cell) => cell.kind === 'day'),
    )
    expect(dayCells).toHaveLength(2)
    expect(dayCells.every((cell) => cell.totalTokens === 0)).toBe(true)
  })

  it('buildYearHeatmap spans the full calendar year', () => {
    const heatmap = buildYearHeatmap({
      year: 2026,
      tokensByDate: new Map([['2026-03-15', 10]]),
    })

    expect(heatmap.rangeLabel).toBe('2026')
    expect(heatmap.weekCount).toBeGreaterThanOrEqual(52)
    const marchCell = heatmap.rows
      .flatMap((row) => row.cells)
      .find((cell) => cell.date === '2026-03-15')
    expect(marchCell?.totalTokens).toBe(10)
  })

  it('current year helpers stay consistent', () => {
    expect(utcYear()).toBeGreaterThan(2020)
    expect(yearDayKeys(utcYear()).length).toBeGreaterThanOrEqual(365)
  })
})
