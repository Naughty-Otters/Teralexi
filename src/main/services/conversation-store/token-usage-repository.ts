import type Database from 'better-sqlite3'
import {
  buildTokenUsageChartPoints,
  tokenUsageSeriesKey,
  tokenUsageSeriesLabel,
} from './token-usage-helpers'
import type {
  StoredTokenUsageRecord,
  TokenUsageChartSeries,
} from './types'

export class TokenUsageRepository {
  constructor(private readonly db: Database.Database) {}

  insert(record: StoredTokenUsageRecord): void {
    this.db
      .prepare(
        `INSERT INTO llm_token_usage (
          id, user_id, recorded_at, conversation_id, agent_id,
          assistant_message_id, step_id, source, provider, model,
          input_tokens, output_tokens, total_tokens
        ) VALUES (
          @id, @userId, @recordedAt, @conversationId, @agentId,
          @assistantMessageId, @stepId, @source, @provider, @model,
          @inputTokens, @outputTokens, @totalTokens
        )`,
      )
      .run(record)
  }

  listChartSeries(args: {
    userId: string
    since?: string
    until?: string
    bucketMinutes?: number
  }): TokenUsageChartSeries[] {
    const until = args.until ?? new Date().toISOString()
    const since =
      args.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const bucketMinutes = Math.max(1, Math.floor(args.bucketMinutes ?? 15))

    const rawRows = this.db
      .prepare(
        `SELECT
          recorded_at,
          provider,
          model,
          input_tokens,
          output_tokens,
          total_tokens
        FROM llm_token_usage
        WHERE user_id = @userId
          AND recorded_at >= @since
          AND recorded_at <= @until
        ORDER BY recorded_at ASC
        LIMIT 5000`,
      )
      .all({
        userId: args.userId,
        since,
        until,
      }) as Array<{
      recorded_at: string
      provider: string | null
      model: string | null
      input_tokens: number
      output_tokens: number
      total_tokens: number
    }>

    if (rawRows.length === 0) return []

    const rowsBySeries = new Map<
      string,
      {
        provider: string | null
        model: string | null
        rows: typeof rawRows
      }
    >()

    for (const row of rawRows) {
      const seriesKey = tokenUsageSeriesKey(row.provider, row.model)
      const bucket = rowsBySeries.get(seriesKey)
      if (bucket) {
        bucket.rows.push(row)
      } else {
        rowsBySeries.set(seriesKey, {
          provider: row.provider,
          model: row.model,
          rows: [row],
        })
      }
    }

    return [...rowsBySeries.entries()]
      .map(([seriesKey, group]) => ({
        seriesKey,
        provider: group.provider,
        model: group.model,
        label: tokenUsageSeriesLabel(group.provider, group.model),
        points: buildTokenUsageChartPoints(group.rows, bucketMinutes),
      }))
      .filter((series) => series.points.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label))
  }
}
