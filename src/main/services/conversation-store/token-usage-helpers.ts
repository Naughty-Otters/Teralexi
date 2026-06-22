import type {
  TokenUsageChartPoint,
  TokenUsageDailyBar,
  TokenUsageDashboard,
  TokenUsageModelSummary,
} from './types'

export function tokenUsageSeriesKey(
  provider: string | null,
  model: string | null,
): string {
  const p = (provider ?? '').trim() || 'unknown'
  const m = (model ?? '').trim() || 'unknown'
  return `${p}::${m}`
}

export function tokenUsageSeriesLabel(
  provider: string | null,
  model: string | null,
): string {
  const p = (provider ?? '').trim()
  const m = (model ?? '').trim()
  if (p && m) return `${p} / ${m}`
  if (m) return m
  if (p) return p
  return 'Unknown model'
}

export function buildTokenUsageChartPoints(
  rawRows: Array<{
    recorded_at: string
    input_tokens: number
    output_tokens: number
    total_tokens: number
  }>,
  bucketMinutes: number,
): TokenUsageChartPoint[] {
  if (rawRows.length === 0) return []

  const bucketSeconds = Math.max(1, bucketMinutes) * 60

  if (rawRows.length <= 120) {
    return rawRows.map((row) => ({
      recordedAt: row.recorded_at,
      inputTokens: Number(row.input_tokens) || 0,
      outputTokens: Number(row.output_tokens) || 0,
      totalTokens:
        Number(row.total_tokens) ||
        (Number(row.input_tokens) || 0) + (Number(row.output_tokens) || 0),
    }))
  }

  const buckets = new Map<
    string,
    { inputTokens: number; outputTokens: number; totalTokens: number }
  >()

  for (const row of rawRows) {
    const epoch = Math.floor(new Date(row.recorded_at).getTime() / 1000)
    if (!Number.isFinite(epoch)) continue
    const bucketEpoch = Math.floor(epoch / bucketSeconds) * bucketSeconds
    const recordedAt = new Date(bucketEpoch * 1000).toISOString()
    const inputTokens = Number(row.input_tokens) || 0
    const outputTokens = Number(row.output_tokens) || 0
    const totalTokens = Number(row.total_tokens) || inputTokens + outputTokens
    const existing = buckets.get(recordedAt)
    if (existing) {
      existing.inputTokens += inputTokens
      existing.outputTokens += outputTokens
      existing.totalTokens += totalTokens
    } else {
      buckets.set(recordedAt, { inputTokens, outputTokens, totalTokens })
    }
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([recordedAt, counts]) => ({
      recordedAt,
      ...counts,
    }))
}

export function utcDayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export function eachUtcDayInRange(sinceIso: string, untilIso: string): string[] {
  const since = new Date(sinceIso)
  const until = new Date(untilIso)
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) return []

  const days: string[] = []
  const cursor = new Date(
    Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()),
  )
  const end = new Date(
    Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate()),
  )

  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return days
}

type DailyUsageRow = {
  day: string
  provider: string | null
  model: string | null
  total_tokens: number
}

export function buildTokenUsageDashboard(args: {
  since: string
  until: string
  overview: {
    sessions: number
    messages: number
    total_tokens: number
    active_days: number
  }
  dailyRows: DailyUsageRow[]
}): TokenUsageDashboard {
  const modelTotals = new Map<
    string,
    {
      provider: string | null
      model: string | null
      label: string
      totalTokens: number
    }
  >()

  const byDay = new Map<string, Map<string, number>>()

  for (const row of args.dailyRows) {
    const day = row.day
    if (!day) continue
    const seriesKey = tokenUsageSeriesKey(row.provider, row.model)
    const tokens = Number(row.total_tokens) || 0
    if (tokens <= 0) continue

    const model = modelTotals.get(seriesKey)
    if (model) {
      model.totalTokens += tokens
    } else {
      modelTotals.set(seriesKey, {
        provider: row.provider,
        model: row.model,
        label: tokenUsageSeriesLabel(row.provider, row.model),
        totalTokens: tokens,
      })
    }

    const dayBucket = byDay.get(day) ?? new Map<string, number>()
    dayBucket.set(seriesKey, (dayBucket.get(seriesKey) ?? 0) + tokens)
    byDay.set(day, dayBucket)
  }

  const models: TokenUsageModelSummary[] = [...modelTotals.entries()]
    .map(([seriesKey, model]) => ({
      seriesKey,
      provider: model.provider,
      model: model.model,
      label: model.label,
      totalTokens: model.totalTokens,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens || a.label.localeCompare(b.label))

  const dailyBars: TokenUsageDailyBar[] = eachUtcDayInRange(args.since, args.until).map(
    (date) => {
      const segmentsMap = byDay.get(date)
      const segments = segmentsMap
        ? [...segmentsMap.entries()]
            .map(([seriesKey, totalTokens]) => ({ seriesKey, totalTokens }))
            .sort((a, b) => b.totalTokens - a.totalTokens)
        : []
      const totalTokens = segments.reduce((sum, segment) => sum + segment.totalTokens, 0)
      return { date, segments, totalTokens }
    },
  )

  return {
    overview: {
      sessions: Number(args.overview.sessions) || 0,
      messages: Number(args.overview.messages) || 0,
      totalTokens: Number(args.overview.total_tokens) || 0,
      activeDays: Number(args.overview.active_days) || 0,
    },
    models,
    dailyBars,
  }
}
