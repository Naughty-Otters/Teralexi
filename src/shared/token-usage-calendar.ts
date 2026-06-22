export function utcTodayKey(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10)
}

export function utcYear(): number {
  return new Date().getUTCFullYear()
}

/** Inclusive UTC day keys for the last N days ending today. */
export function lastNDayKeys(dayCount: number): string[] {
  const today = new Date(`${utcTodayKey()}T00:00:00.000Z`)
  const days: string[] = []
  for (let offset = dayCount - 1; offset >= 0; offset--) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - offset)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

/** Every UTC day in a calendar year (Jan 1 – Dec 31). */
export function yearDayKeys(year: number): string[] {
  const days: string[] = []
  const cursor = new Date(Date.UTC(year, 0, 1))
  const end = new Date(Date.UTC(year, 11, 31))
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

export function last30DaysRange(): { since: string; until: string } {
  const days = lastNDayKeys(30)
  return {
    since: `${days[0]}T00:00:00.000Z`,
    until: new Date().toISOString(),
  }
}

export function currentUtcYearRange(): { since: string; until: string } {
  const year = utcYear()
  return {
    since: new Date(Date.UTC(year, 0, 1)).toISOString(),
    until: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)).toISOString(),
  }
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** GitHub-style: weekday rows, week columns, oldest left → newest right. */
export const HEATMAP_EMPHASIS_WEEKDAYS = new Set([0, 3, 6])

export type CalendarHeatmapCell = {
  kind: 'padding' | 'day'
  date?: string
  totalTokens: number
}

export type CalendarHeatmapRow = {
  weekday: number
  label: string
  showLabel: boolean
  cells: CalendarHeatmapCell[]
}

export function buildRollingDayHeatmap(args: {
  dates: string[]
  tokensByDate: Map<string, number>
  rangeLabel?: string
}): {
  weekCount: number
  rows: CalendarHeatmapRow[]
  startLabel: string
  endLabel: string
  rangeLabel: string
} {
  const { dates, tokensByDate, rangeLabel } = args
  if (dates.length === 0) {
    return { weekCount: 0, rows: [], startLabel: '', endLabel: '', rangeLabel: rangeLabel ?? '' }
  }

  const firstDate = dates[0]!
  const lastDate = dates[dates.length - 1]!
  const firstD = new Date(`${firstDate}T00:00:00.000Z`)
  const lastD = new Date(`${lastDate}T00:00:00.000Z`)
  const startWeekday = firstD.getUTCDay()
  const weekCount = Math.ceil((startWeekday + dates.length) / 7)

  const firstSunday = new Date(firstD)
  firstSunday.setUTCDate(firstD.getUTCDate() - startWeekday)

  const rows: CalendarHeatmapRow[] = WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    showLabel: HEATMAP_EMPHASIS_WEEKDAYS.has(weekday),
    cells: Array.from({ length: weekCount }, (_, weekIndex) => {
      const cellDate = new Date(firstSunday)
      cellDate.setUTCDate(firstSunday.getUTCDate() + weekIndex * 7 + weekday)

      if (cellDate < firstD || cellDate > lastD) {
        return { kind: 'padding' as const, totalTokens: 0 }
      }

      const date = cellDate.toISOString().slice(0, 10)
      return {
        kind: 'day' as const,
        date,
        totalTokens: tokensByDate.get(date) ?? 0,
      }
    }),
  }))

  return {
    weekCount,
    rows,
    startLabel: formatShortDayLabel(firstDate),
    endLabel: formatShortDayLabel(lastDate),
    rangeLabel: rangeLabel ?? `${formatShortDayLabel(firstDate)} – ${formatShortDayLabel(lastDate)}`,
  }
}

export function buildYearHeatmap(args: {
  year: number
  tokensByDate: Map<string, number>
}): ReturnType<typeof buildRollingDayHeatmap> {
  return buildRollingDayHeatmap({
    dates: yearDayKeys(args.year),
    tokensByDate: args.tokensByDate,
    rangeLabel: String(args.year),
  })
}

export function formatShortDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
