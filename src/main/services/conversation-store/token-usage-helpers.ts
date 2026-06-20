import type { TokenUsageChartPoint } from './types'

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
